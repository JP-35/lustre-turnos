// Genera docs/INFORME-PRUEBAS.md corriendo la suite real y cruzándola con las reglas de docs/SPEC.md.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const back = path.join(raiz, 'backend');
const motor = process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'SQLite en memoria';

const r = spawnSync('node', ['--test', '--test-concurrency=1', '--test-reporter=spec', 'test/*.test.js'], { cwd: back, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const salida = `${r.stdout}\n${r.stderr}`;
const pruebas = [...salida.matchAll(/^\s*(✔|✖)\s+(.+?)\s+\(([\d.]+)ms\)\s*$/gm)].map((m) => ({ ok: m[1] === '✔', nombre: m[2] }));
const cuenta = (k) => Number((salida.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
const total = cuenta('tests'); const ok = cuenta('pass'); const mal = cuenta('fail');

const spec = readFileSync(path.join(raiz, 'docs', 'SPEC.md'), 'utf8');
const reglas = [...spec.matchAll(/^- \*\*(R\d\d)\*\* (.+)$/gm)].map((m) => ({ id: m[1], texto: m[2].replace(/\*\*/g, '').slice(0, 95) }));
const filas = reglas.map((g) => {
  const ts = pruebas.filter((t) => new RegExp(`\\b${g.id}\\b`).test(t.nombre));
  const estado = ts.length === 0 ? '⚠ sin prueba' : ts.every((t) => t.ok) ? '✔ pasa' : '✖ falla';
  return `| ${g.id} | ${g.texto}${g.texto.length >= 95 ? '…' : ''} | ${ts.length} | ${estado} |`;
});
const sinPrueba = reglas.filter((g) => !pruebas.some((t) => new RegExp(`\\b${g.id}\\b`).test(t.nombre))).map((g) => g.id);

const e2eFile = path.join(raiz, 'e2e', 'resultado.txt');
const e2e = existsSync(e2eFile) ? readFileSync(e2eFile, 'utf8').split('\n').filter((l) => l.startsWith('✔') || l.startsWith('E2E')).join('\n') : null;
const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const md = `# Informe de pruebas — Lustre Turnos

Generado automáticamente con \`npm run informe\` el ${fecha} (hora de Argentina). No se edita a mano: se vuelve a generar.

## 1. Resultado general

| Métrica | Valor |
|---|---|
| Pruebas ejecutadas | **${total}** |
| Pasaron | **${ok}** |
| Fallaron | **${mal}** |
| Reglas de la spec con al menos una prueba | **${reglas.length - sinPrueba.length} de ${reglas.length}** |
| Motor de base usado en esta corrida | ${motor} |
| Entorno | Node ${process.version}, \`node:test\` (sin dependencias de testing) |

**Estado: ${mal === 0 && total > 0 && sinPrueba.length === 0 ? '✔ TODOS LOS TESTS PASAN y todas las reglas tienen respaldo' : '✖ HAY PENDIENTES'}**

## 2. Estrategia
- **Rojo → verde → refactor** por tarea (ver \`docs/TAREAS.md\`, un commit por tarea).
- **Unitarias** de reglas puras (\`reglas.test.js\`, \`reloj.test.js\`): horarios, precios, deuda, zona horaria.
- **De servicio** con base real en memoria y Reloj fijo (\`reservas\`, \`cancelacion\`, \`admin\`, \`disponibilidad\`, \`auth\`).
- **De concurrencia**: 5 reservas simultáneas al mismo hueco → exactamente una confirmada, cuatro 409 (R06, R07).
- **De API HTTP real** (\`http.test.js\`): servidor levantado, \`fetch\`, permisos, CORS, formato de errores, archivos estáticos.
- **Extremo a extremo** en navegador real (Playwright, \`e2e/e2e.mjs\`).
- El **Reloj** se maneja “a control remoto”: se fija una fecha, se reserva, se adelanta y se cancela, sin esperar un día.
- **Casos extremos** cubiertos: bordes exactos (24 h, 2 h, 19:00, 30 días), días cerrados, deuda pendiente, duplicados, JSON roto, token alterado/vencido, intentos de enviar el precio desde el cliente.

## 3. Trazabilidad: regla → pruebas

| Regla | Descripción | Pruebas | Estado |
|---|---|---|---|
${filas.join('\n')}

## 4. Detalle de cada prueba

${pruebas.map((t) => `- ${t.ok ? '✔' : '✖'} ${t.nombre}`).join('\n')}

## 5. Prueba extremo a extremo (navegador)
${e2e ? `\`\`\`\n${e2e}\n\`\`\`\nCapturas en \`e2e/capturas/\`.` : '_No se encontró `e2e/resultado.txt`._'}

## 6. Límites conocidos y cómo se cubren
- Esta corrida usó **${motor}**. El mismo conjunto de pruebas corre contra **PostgreSQL** definiendo \`TEST_DATABASE_URL\`; el workflow de GitHub Actions (\`.github/workflows/ci.yml\`, job \`postgres\`) lo ejecuta en cada push. Conviene mirar que ese job esté en verde una vez subido el repo.
- Sin límite de intentos de login (mejora futura, ver \`docs/PLAN.md\`).
- El plan gratuito de Render se duerme; la primera solicitud tarda ~30 s (el frontend lo avisa).
`;
writeFileSync(path.join(raiz, 'docs', 'INFORME-PRUEBAS.md'), md);
console.log(`Informe generado: ${ok}/${total} pasan, ${sinPrueba.length} reglas sin prueba.`);
if (mal > 0 || sinPrueba.length) process.exitCode = 1;
