# 🔮 Lumee 2.0 - 똑똑한 감성 날씨 어시스턴트

> "사용자 취향과 건강 민감도를 반영해, 가장 필요한 날씨 정보를 선별해주는 AI 날씨 비서"


## 📌 프로젝트 개요

- 개발 기간: 2025.09.19 ~
- 개발 목적: 



## 🚀 주요 기능

- 🔍 LLM 기반 자연어 질문 인식: `"마스크 써야 해?"`, `"서울 비와?"`, `"우산 챙길까?"`
- 🌐 사용자 위치 기반 자동 날씨 제공
- 🎯 사용자 민감 요소/취미 기반 맞춤형 조언
- 📊 기온/미세먼지 그래프 시각화
- 🧠 LLM에게 실시간 날씨 정보를 넘겨 최종 응답 생성



## 💻 링크

- DEMO: [Lumee🔮](https://hongsoonil.github.io/weather-assistant-frontend/)
- PREVIEW: [Demo Video: Lumee⛅🔮](https://youtu.be/PBAn7sUd3rI?feature=shared)
- WORKSPACE: [Team Project: Lumee⛅🔮](https://www.notion.so/Team-Project-Lumee-202d2eacfdb280779c36f2f214d1584e?pvs=21)



## 👥 팀원

| 이름 | 역할 |
| --- | --- |
| 홍순일　<br/> (팀장) | PM, 개발팀 |
| 정지은 | 개발팀 |
| 문수현 | 디자인팀 |
| 이지윤 | 디자인팀 |
| 조현지 | 디자인팀 |



## 🛠️ 사용 기술 스택

| 분야 | 기술 |
| --- | --- |
| 프론트엔드 | React, Tailwind CSS, Recharts |
| 백엔드 | Node.js |
| AI 모델 | Gemini API (Google Generative AI) |
| 데이터 API | OpenWeather(날씨), Ambee(꽃가루), Google Geocoding(위치) |
| DB | Firebase Realtime Database |
| 배포 | GithubPage(FE), Render (BE) |
| 생성형 AI 영상 제작 | Midjourney(구슬 컨셉 디자인), Runway(구슬 영상 생성) |



## 📂 프로젝트 구조

### 1. 리포지토리

[**Front : weather-assistant-frontend**](https://github.com/havetodo-yeon/weather-assistant-frontend.git)

[**Back : weather-assistant-backend**](https://github.com/havetodo-yeon/weather-assistant-backend.git)

### 2. 파일구조

```markdown
📦 Mobile-Magicians
┣ 📂 weather-assistant-frontend
┃  ┣ 📂 weather-assistant
┃  ┃  ┗ 📂 src
┃  ┃    ┣ 📂 screens
┃  ┃    ┣ 📂 services
┃  ┃    ┣ 📜 App.js
┃  ┃    ┗ ...
┃  ┗ ...
┣ 📂 weather-assistant-backend
┃  ┗ 📂 backend
┃    ┣ 🔒 .env
┃    ┣ 📜 server.js
┃    ┣ 📜 tools.js
┃    ┣ 📜 geminiUtils.js
┃    ┣ 📜 weatherUtils.js
┃    ┣ 📜 userProfileUtils.js
┃    ┗ ...
┗ ...
```



## ⚙️ 로컬 실행 방법

### 1. 백엔드 실행

```bash
bash
cd weather-assistant-backend/backend
npm init -y
npm install express cors body-parser axios
npm install firebase
node server.js
```

### 2. 프론트엔드 실행

```bash
cd weather-assistant-frontend/weather-assistant
npm install
npm install chart.js react-chartjs-2
npm start
```

### 3. `.env` 파일 설정

```makefile
GEMINI_API_KEY=YOUR_GEMINI_API_KEY              # Gemini API 키 (LLM 질문 응답)
OPENWEATHER_API_KEY=YOUR_OPENWEATHER_API_KEY    # 날씨 데이터
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY    # 좌표 → 주소
AMBEE_POLLEN_API_KEY=YOUR_AMBEE_POLLEN_API_KEY  # 꽃가루 정보
```
