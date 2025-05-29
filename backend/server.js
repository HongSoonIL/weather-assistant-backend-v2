// require('dotenv').config();
const convo = require('./conversationStore');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = 4000;

// 키 외부 노출을 막기 위해 배포 후 .env 파일로 분리할 수 있음.
const GEMINI_API_KEY = 'AIzaSyAsxn4RLgLzEc8FuuEh9F5fo4JzQp9YjZo';

app.use(cors());
app.use(bodyParser.json());

app.post('/gemini', async (req, res) => {
  const { userInput } = req.body;

  // ✅ 오늘 날짜를 한국어 형식으로 가져오기
  const now = new Date();
  const today = now.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  // ✅ 프롬프트에 오늘 날짜 포함
  const systemPrompt = `오늘은 ${today}입니다. 사용자는 아래와 같은 질문을 했습니다:\n"${userInput}"\n사용자에게 친절하고 자연스럽게 답변해 주세요. 가능하면 요약된 정보와 행동 조언도 포함해 주세요.`;

  try {
    convo.addUserMessage(systemPrompt);

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: convo.getHistory()
      }
    );

    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply.';

    // ✅ 텍스트 클렌징: 마크다운 제거 + 리스트 기호 변환 및 줄바꿈 적용
    const cleanedReply = reply
      .replace(/\*\*/g, '')                       // ** 굵은 글씨 제거
      .replace(/^\s*\*\s?/gm, '• ')               // * 기호를 • 로 대체
      .replace(/(• )/g, '\n$1')                   // • 앞에 줄바꿈 추가
      .replace(/\n{2,}/g, '\n');                  // 연속 줄바꿈 정리

    convo.addBotMessage(cleanedReply);
    convo.trimTo(10);

    res.json({ reply: cleanedReply });

  } catch (err) {
    console.error('❌ Gemini API 오류 발생!');
    console.error('↳ 상태 코드:', err.response?.status);
    console.error('↳ 상태 텍스트:', err.response?.statusText);
    console.error('↳ 응답 데이터:', JSON.stringify(err.response?.data, null, 2));
    console.error('↳ 요청 내용:', err.config?.data);

    res.status(err.response?.status || 500).json({
      error: 'Gemini API 호출 실패',
      message: err.response?.data?.error?.message || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Gemini 백엔드 서버 실행 중: http://localhost:${PORT}`);
});
