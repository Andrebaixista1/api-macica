require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const axios = require('axios');

const app = express();
app.use(express.json());

const connection = mysql.createConnection({
  host: process.env.DB_HOST_QUERIES,
  user: process.env.DB_USER_QUERIES,
  password: process.env.DB_PASS_QUERIES,
  database: process.env.DB_NAME_QUERIES,
  connectTimeout: 10000
});

app.post('/query', async (req, res) => {
  const userPrompt = req.body.prompt;
  if (!userPrompt) {
    return res.status(400).json({ error: 'Prompt não informado.' });
  }
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente que converte pedidos em português para consultas SQL válidas usando a tabela consignados_122023_test. 
Sempre gere instruções SQL válidas sem texto extra. 
A tabela consignados_122023_test possui uma coluna dt-nascimento em formato YYYY-MM-DD. 
Se o usuário fornecer uma data em DD-MM-YYYY, converta para YYYY-MM-DD na query. 
Se o usuário pedir um limite de linhas, use LIMIT X. Retorne apenas a query.`
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 150,
        temperature: 0.0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`
        }
      }
    );
    const sqlQuery = openaiResponse.data.choices[0].message.content.trim();
    connection.query(sqlQuery, (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = app;
