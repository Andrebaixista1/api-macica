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

const manualMapping = {
  "banco do brasil": { code: "1", fullName: "Banco do Brasil S.A." },
  "bradesco": { code: "237", fullName: "Banco Bradesco S.A." },
  "itau unibanco": { code: "341", fullName: "Itaú Unibanco S.A." },
  "itau consignado": { code: "29", fullName: "Itaú Consignado" },
  "santander": { code: "33", fullName: "Banco Santander (Brasil) S.A." }
};

function extrairBancos(frase) {
  const regex = /banco\s+([\w\s,]+)/i;
  const match = frase.match(regex);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/,| e /i)
    .map(b => b.trim().toLowerCase())
    .filter(Boolean);
}

app.post('/query', async (req, res) => {
  const userPrompt = req.body.prompt;
  if (!userPrompt) {
    return res.status(400).json({ error: 'Prompt não informado.' });
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    let bancosBuscados = [];
    let bancosEncontrados = [];

    if (/banco/i.test(userPrompt)) {
      bancosBuscados = extrairBancos(userPrompt);
      if (bancosBuscados.length > 0) {
        const { data: listaBancos } = await axios.get('https://brasilapi.com.br/api/banks/v1');
        for (const nomeBanco of bancosBuscados) {
          if (manualMapping[nomeBanco]) {
            bancosEncontrados.push({
              code: manualMapping[nomeBanco].code,
              fullName: manualMapping[nomeBanco].fullName
            });
          } else {
            const encontrado = listaBancos.find(b =>
              b.fullName && b.fullName.toLowerCase().includes(nomeBanco.toLowerCase())
            );
            if (encontrado) {
              bancosEncontrados.push({
                code: encontrado.code,
                fullName: encontrado.fullName
              });
            }
          }
        }
      }
    }

    let systemPrompt = `
Você é um assistente que converte pedidos em português para consultas SQL válidas usando a tabela consignados_122023_test (apelidada como t).
Sempre gere instruções SQL válidas sem texto extra.
Retorne SEMPRE t.* e (YEAR(CURDATE()) - YEAR(t.dt_nascimento)) AS idade.
Se o usuário mencionar vários bancos e tivermos seus codes e fullNames, use t.id_banco_empres IN (...) para filtrar
e retorne um CASE para banco_completo:
CASE
 WHEN t.id_banco_empres = 'CODE1' THEN 'CODE1 - FULLNAME1'
 WHEN t.id_banco_empres = 'CODE2' THEN 'CODE2 - FULLNAME2'
 ...
 ELSE t.id_banco_empres
END AS banco_completo.
Se não encontrar nenhum banco, retorne t.id_banco_empres normalmente.
Se o usuário fornecer data em DD-MM-YYYY ou DD/MM/YYYY, converta para YYYY-MM-DD.
Se o usuário pedir limite, use LIMIT X. 
Se o usuário pedir especie então se refere a coluna esp. 
Se o usuário pedir pagas precisa fazer o calculo de quantos meses tem entre comp_ini_desconto e a data atual e adicione a coluna pagas mesmo sem pedir. 
Se o usuário pedir restantes precisa fazer o calculo de quantos meses tem entre comp_ini_desconto e a data atual menos a quant_parcelas e adicione a coluna restantes mesmo sem pedir. 
Use sempre FROM consignados_122023_test t, sem usar inbis.t nem FROM t.
Retorne apenas a query, sem crases triplas, sem markdown, sem explicações adicionais.
`;

    if (bancosEncontrados.length > 0) {
      const obsLinhas = bancosEncontrados.map(b =>
        `- code = "${b.code}", fullName = "${b.fullName}"`
      ).join('\n');
      systemPrompt += `
Observação: O usuário pediu vários bancos:
${obsLinhas}
Use t.id_banco_empres IN (${bancosEncontrados.map(b => `'${b.code}'`).join(', ')}) se for filtrar.
Monte o CASE para banco_completo com cada code e fullName.
`;
    } else if (/banco/i.test(userPrompt)) {
      systemPrompt += `
Observação: O usuário mencionou bancos, mas nenhum match foi encontrado na BrasilAPI nem no mapeamento manual.
Retorne t.id_banco_empres normalmente.
`;
    }

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.0
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`
        }
      }
    );

    let sqlQuery = openaiResponse.data.choices[0].message.content.trim();
    sqlQuery = sqlQuery.replace(/```/g, '');
    sqlQuery = sqlQuery.replace(/^sql\n/, '');
    sqlQuery = sqlQuery.replace(/^```sql/, '');

    console.log('Query final:', sqlQuery);

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
