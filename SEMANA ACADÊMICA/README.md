# Site de Inscrição - Semana Acadêmica

Este projeto agora possui:
- página pública de inscrição
- geração de Pix Copia e Cola e QR Code
- upload de comprovante
- backend em Node.js com Express
- gravação das inscrições no MySQL
- painel administrativo para ver os inscritos

## Banco de dados
Banco configurado para uso: `semanacademica`

O backend cria automaticamente a tabela `registrations` quando inicia.

## Configuração
1. Confira o arquivo `.env`
2. Ajuste, se necessário:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `PORT`

## Instalar dependências
```bash
npm install
```

## Rodar o sistema
```bash
npm start
```

## Acessos
- Inscrição: `http://localhost:3000`
- Painel de inscritos: `http://localhost:3000/admin`

## Fluxo atual
1. O aluno preenche a inscrição
2. Gera o Pix
3. Anexa o comprovante
4. O sistema envia os dados para o backend
5. A inscrição é salva no MySQL com status `aguardando_conferencia`
6. O comprovante fica salvo na pasta `uploads/`

## Observação importante
Se o seu MySQL não estiver usando `root` sem senha, ajuste o `.env` com seu usuário e senha reais antes de rodar.
