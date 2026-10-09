# Server notes

## Local Ollama support chat

The website mounts its floating support chat on every browser route. Messages go to `POST /api/support/chat`; the Express server adds the Cryptomania platform guide and forwards the conversation to Ollama. The browser never connects to Ollama directly.

By default, Ollama must be reachable from the Express server at `http://127.0.0.1:11434`, with model `ghunghab/qwen2.5-1.5b:q4km` available. For a local setup:

```sh
ollama pull ghunghab/qwen2.5-1.5b:q4km
ollama serve
```

The route accepts `OLLAMA_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_MS` environment overrides. The default Ollama response timeout is 120 seconds to allow a locally hosted model to load and answer on CPU. If the server runs in a container, `127.0.0.1` means that container; configure `OLLAMA_URL` to the Ollama host address reachable from the container. Keep the chat endpoint on the server side so browsers cannot use it to access arbitrary local services.

---

Contact: Stephane Jacob <jacobstephane@outlook.com>
