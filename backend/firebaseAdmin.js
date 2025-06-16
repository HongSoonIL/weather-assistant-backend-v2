// firebaseAdmin.js
const admin = require('firebase-admin');

let serviceAccount;
try {
  // Render에서 Secret File로 등록된 경로 (파일명 맞게)
  serviceAccount = require('/etc/secrets/firebase-key.json');
} catch (e) {
  // 로컬 개발용 fallback
  serviceAccount = require('./lumeeweatherapp-firebase-adminsdk-fbsvc-ffbb9087de.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 🔄 Firestore 인스턴스 내보내기
const db = admin.firestore();

module.exports = {
  admin,
  db,
};