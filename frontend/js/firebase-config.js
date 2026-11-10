const local = ['localhost', '127.0.0.1'].includes(location.hostname);

const localFirebaseConfig = {
  apiKey: 'fake-api-key',
  authDomain: 'demo-attendance.firebaseapp.com',
  projectId: 'demo-attendance',
  appId: 'demo-app-id'
};

// Replace these four values with the Web app config from Firebase Console before deploying.
const productionFirebaseConfig = {
  apiKey: 'AIzaSyDNg7AH5TOwUiE5ZEaUvav4uc-7lgJsGCc',
  authDomain: 'attendease-demo-4684e.firebaseapp.com',
  projectId: 'attendease-demo-4684e',
  appId: '1:908280509966:web:33e35f9019b2ef7fd5ae5f'
};

export const firebaseConfig = local ? localFirebaseConfig : productionFirebaseConfig;
export const API_BASE = local ? 'http://localhost:8080/api' : '/api';
export const USE_AUTH_EMULATOR = local;
