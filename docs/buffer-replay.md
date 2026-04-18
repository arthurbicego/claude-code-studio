# Buffer de replay — melhoria futura

Esta ideia foi desenhada e descartada na fase de implementação das sessões persistentes. Ficou documentada aqui caso a UX da versão enxuta se mostre insuficiente.

## Problema que o buffer resolve

Quando você volta a uma sessão **parked ativa** (processo vivo, ainda processando em background), o xterm do cliente foi desmontado ao trocar de aba. Ao remontar, ele está vazio — e o processo `claude` já emitiu output para um WebSocket que ninguém estava lendo. Resultado: terminal em branco, você só vê output novo a partir da reconexão.

O histórico da conversa (mensagens do user, respostas do assistant, tool results) **não está perdido** — continua no JSONL e pode ser reconstruído via `--resume`. O buffer é puramente sobre **preservação visual do terminal** durante reconexão sem re-spawn.

## Solução proposta

Server guarda os últimos ~100 KB de output por sessão em um buffer circular. Ao reconectar:

1. WS envia `{type: 'replay', data: buffer_concatenated}` antes dos dados normais.
2. Cliente escreve no xterm.
3. Continua normalmente com output live.

## Trade-offs

| Prós | Contras |
|---|---|
| Retomada instantânea, fiel ao estado visual anterior | ~110 KB de RAM por sessão viva no server |
| Sobrevive a reload do browser (desde que o server não reinicie) | ~200 linhas de código extras (buffer circular, broadcast, lógica de replay) |
| UX consistente entre "parked ativa" e "parked standby" | Mais uma coisa pra testar e depurar |

## Quando reconsiderar

- Usuários reclamarem que "ao voltar em sessão processando, perdi o contexto visual".
- Introdução de abas lado-a-lado (múltiplas sessões visíveis ao mesmo tempo) — buffer fica mais valioso porque permite reconectar sem `--resume`.
- Projetos grandes com muitas tool calls cujos outputs parciais são interessantes.

## Alternativa complementar

**xterm montado escondido no cliente.** Cada TerminalView fica montado, só muda `display:none` ao trocar de aba. Dispensa buffer no server mas:

- Consome ~5–10 MB de RAM no browser por sessão aberta.
- Não sobrevive a reload da página.
- Limita sessões em múltiplas abas/janelas (cada aba tem suas próprias instâncias).

Pode ser combinado com buffer: xterm hidden pra UX normal + buffer server-side pra fallback após reload.

## Arquitetura sugerida (se for implementar)

```js
// Server
liveSessions = Map<sessionKey, {
  pty,
  buffer: string[],          // chunks
  bufferSize: number,         // soma em bytes
  subscribers: Set<ws>,
  lastOutputAt: number,
  idleSince: number | null,
}>

const BUFFER_MAX_BYTES = 100 * 1024;

// Ao receber output do PTY:
pty.onData(data => {
  entry.buffer.push(data);
  entry.bufferSize += Buffer.byteLength(data);
  while (entry.bufferSize > BUFFER_MAX_BYTES) {
    const dropped = entry.buffer.shift();
    entry.bufferSize -= Buffer.byteLength(dropped);
  }
  for (const ws of entry.subscribers) safeSend(ws, { type: 'data', data });
});

// Ao novo subscriber conectar:
ws.send(JSON.stringify({ type: 'replay', data: entry.buffer.join('') }));
entry.subscribers.add(ws);
```

Cliente:

```ts
// TerminalView
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'replay') term.write(msg.data);
  else if (msg.type === 'data') term.write(msg.data);
  // ...
};
```

Nada sofisticado — acrescenta ~50 linhas de server e ~10 de cliente.

## Decisão atual

Versão enxuta (sem buffer). Ao clicar numa sessão parked:

- **Standby**: kill + respawn com `--resume`, re-renderiza tudo do JSONL.
- **Ativa**: reconecta silenciosamente, aceita perda do histórico visual da janela anterior.

Se quiser o histórico visual de uma sessão ativa, fechar e reabrir força o caminho do `--resume`.
