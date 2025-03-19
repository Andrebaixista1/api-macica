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
  connectTimeout: 10000  // 10 segundos de timeout
});


app.post('/query', async (req, res) => {
  const userPrompt = req.body.prompt;
  if (!userPrompt) {
    return res.status(400).json({ error: 'Prompt não informado.' });
  }

  try {
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente que converte pedidos em português para consultas SQL válidas usando a tabela consignados_122023. Sempre gere instruções SQL válidas sem texto extra. A tabela consignados_122023 possui uma coluna dt-nascimento em formato YYYY-MM-DD. Se o usuário fornecer uma data em DD-MM-YYYY, converta para YYYY-MM-DD na query. Se o usuário pedir um limite de linhas, use LIMIT X. Retorne apenas a query.'
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
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const sqlQuery = openaiResponse.data.choices[0].message.content.trim();
    console.log('Query gerada:', sqlQuery);

    connection.query(sqlQuery, (err, results) => {
      if (err) {
        console.error('Erro ao executar a query:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    });
  } catch (error) {
    console.error('Erro na chamada à API do GPT:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
