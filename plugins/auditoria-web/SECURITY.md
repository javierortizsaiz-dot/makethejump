# Seguridad · Security

**Qué puede hacer este plugin en tu máquina / What this plugin can do on your machine**

| | |
| --- | --- |
| Hooks | Ninguno. Nada se ejecuta solo. / None. Nothing runs on its own. |
| Telemetría / Telemetry | Ninguna. / None. |
| Claves / Keys | No pide ni guarda claves. Solo usa conectores ya autorizados en tu sesión. / Never asks for or stores keys; only uses connectors you already authorised. |
| Red / Network | Solo las webs que audites y las de los competidores que autorices, con 1 petición por segundo y respetando robots.txt. / Only the sites you audit and the competitors you authorise, 1 request per second, honouring robots.txt. |
| Escritura / Writes | Solo en la carpeta `auditoria/` de tu proyecto. Nunca envía formularios ni crea cuentas. / Only to `auditoria/` in your project. Never submits forms or creates accounts. |
| Código ejecutable / Executable code | `scripts/recoger.mjs` (Playwright, solo lectura). Léelo antes de usarlo. / Read-only Playwright script. Read it before use. |
| Prompt injection | El texto de las páginas auditadas es dato. Si contiene instrucciones para el agente, se ignoran y se reportan como hallazgo. / Page text is data; instructions aimed at the agent are ignored and reported. |

¿Has encontrado un problema? Abre un issue o escribe a través de https://makethejump.org. / Found a problem? Open an issue or get in touch via https://makethejump.org.
