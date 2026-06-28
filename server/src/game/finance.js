async function cancelWaitingTournaments(client, userId, { tier, tournamentId } = {}) {
  const params = [userId];
  const conditions = ["status='waiting'", 'player1_id=$1'];
  if (tier !== undefined) {
    params.push(tier);
    conditions.push(`tier=$${params.length}`);
  }
  if (tournamentId !== undefined) {
    params.push(tournamentId);
    conditions.push(`id=$${params.length}`);
  }

  const result = await client.query(
    `SELECT id,tier,entry_fee FROM tournaments WHERE ${conditions.join(' AND ')} FOR UPDATE`,
    params,
  );
  if (result.rows.length === 0) return { cancelled: 0, refunded: 0 };

  const paid = result.rows.filter(row => row.tier !== 'play' && Number(row.entry_fee) > 0);
  let refunded = '0';
  if (paid.length > 0) {
    const paidIds = paid.map(row => row.id);
    const total = await client.query(
      `SELECT COALESCE(SUM(entry_fee),0) AS amount FROM tournaments WHERE id=ANY($1::uuid[])`,
      [paidIds],
    );
    refunded = total.rows[0].amount;
    await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [refunded, userId]);
    for (const row of paid) {
      await client.query(
        `INSERT INTO transactions(user_id,type,amount,status,metadata)
         VALUES($1,'refund',$2,'confirmed',$3)`,
        [userId, row.entry_fee, JSON.stringify({ tournamentId: row.id })],
      );
    }
  }

  const ids = result.rows.map(row => row.id);
  await client.query(
    `UPDATE tournaments SET status='cancelled',ended_at=NOW() WHERE id=ANY($1::uuid[])`,
    [ids],
  );
  return { cancelled: ids.length, refunded: Number(refunded) };
}

module.exports = { cancelWaitingTournaments };
