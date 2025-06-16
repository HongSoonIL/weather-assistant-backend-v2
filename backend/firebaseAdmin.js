// firebaseAdmin.js
const admin = require('firebase-admin');
const path = require('path');

// 🔐 JSON 키 경로 - 프로젝트 루트에 위치한 JSON 파일
const serviceAccount = require('/etc/secrets/lumeeweatherapp-firebase-adminsdk-fbsvc-ffbb9087de.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Firestore 사용
module.exports = { admin, db };