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

function getOpenAIApiKey() {
  return new Promise((resolve, reject) => {
    connection.query('SELECT `OPENAI_API_KEY` FROM api_token LIMIT 1', (err, results) => {
      if (err) {
        console.error('Erro ao buscar token:', err);
        return reject(err);
      }
      if (results.length > 0) {
        resolve(results[0].OPENAI_API_KEY);
      } else {
        reject(new Error('Token não encontrado na tabela api_token.'));
      }
    });
  });
}

app.post('/query', async (req, res) => {
  const userPrompt = req.body.prompt;
  if (!userPrompt) {
    return res.status(400).json({ error: 'Prompt não informado.' });
  }

  try {
    const openaiApiKey = await getOpenAIApiKey();
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente que converte pedidos em português para consultas SQL...'
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
    console.log('Query gerada:', sqlQuery);

    connection.query(sqlQuery, (err, results) => {
      if (err) {
        console.error('Erro ao executar a query:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    });
  } catch (error) {
    console.error('Erro na operação:', error);
    res.status(500).json({ error: error.message });
  }
});

// Exportamos o app em vez de usar app.listen
module.exports = app;
