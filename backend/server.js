const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = 4000;

const GEMINI_API_KEY = 'AIzaSyCI6ywLq0zcdAVTtZSb5yQ16eTJ1q7rFsM'; // 본인의 키로 교체

app.use(cors());
app.use(bodyParser.json());

app.post('/gemini', async (req, res) => {
  const { userInput } = req.body;

  try {
    const result = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + GEMINI_API_KEY,
      {
        contents: [{ parts: [{ text: userInput }] }]
      }
    );

    const reply = result.data.candidates[0].content.parts[0].text;
    res.json({ reply });
  } catch (err) {
    console.error('Gemini API 오류:', err.message);
    res.status(500).json({ error: 'LLM 호출 실패' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Gemini 백엔드 서버 실행 중: http://localhost:${PORT}`);
});
