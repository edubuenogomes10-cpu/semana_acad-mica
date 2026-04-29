# Site de Inscrição - Semana Acadêmica

Este projeto possui:
- página pública de inscrição
- geração de Pix Copia e Cola e QR Code
- upload de comprovante
- backend em Node.js com Express
- gravação das inscrições no Supabase Postgres
- painel administrativo para ver os inscritos

## Banco de dados
O backend cria automaticamente a tabela `registrations` quando consegue conectar no Postgres.

Em produção na Vercel, as inscrições só persistem se você configurar um banco real.
Agora o backend usa a variável:
- `DATABASE_URL`

Também aceita:
- `POSTGRES_URL`
- `SUPABASE_DB_URL`

Se estiver na Vercel sem essas variáveis, a API falha de forma explícita em vez de fingir que salvou em armazenamento temporário.

## Configuração
1. Confira o arquivo `.env`
2. Ajuste, se necessário:
- `ADMIN_PASSWORD`
- `DATABASE_POOL_URL` para Vercel/Supabase pooler
- `DATABASE_URL`
- `PORT`
- `SITE_URL` para definir a URL oficial de produção
- `LEGACY_HOSTS` para redirecionar domínios/hosts antigos separados por vírgula

## Instalar dependências
```bash
npm install
```

## Rodar o sistema
```bash
npm start
```

## Dica para Vercel + Supabase
Se aparecer erro como `Connection terminated due to connection timeout`, use a URL pooled do Supabase em `DATABASE_POOL_URL`.
Em ambiente serverless isso costuma ser mais estável do que a conexão direta em `DATABASE_URL`.

## Acessos
- Inscrição: `http://localhost:3000`
- Painel de inscritos: `http://localhost:3000/admin`

## Fluxo atual
1. O aluno preenche a inscrição
2. Gera o Pix
3. Anexa o comprovante
4. O sistema envia os dados para o backend
5. A inscrição é salva no Supabase Postgres com status `aguardando_conferencia`
6. O comprovante também fica persistido no banco e pode ser aberto pelo painel administrativo
