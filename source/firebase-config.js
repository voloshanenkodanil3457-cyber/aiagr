'use strict';
// Firebase Web App config for the NEW Magic / media-node-canvas project.
// Firebase web config is public client configuration; provider API keys must never go here.
window.MAGIC_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9C9XCtnH0xfdTLSIYRz8DGAKPEc5ejLk",
  authDomain: "aiagr-80390.firebaseapp.com",
  projectId: "aiagr-80390",
  storageBucket: "aiagr-80390.firebasestorage.app",
  messagingSenderId: "897305382064",
  appId: "1:897305382064:web:d5c61c0ed86bd5c583ff75"
};
window.MAGIC_APP_CONFIG = {
  appName: 'Magic',
  firebaseSdkVersion: '10.12.0',
  defaultProvider: 'byteplus',
  defaultVideoModel: 'dreamina-seedance-2-5-260628',
  // Optional Cloudflare Worker gateway. Leave empty for Direct browser test mode.
  // Set it in My settings after deploying cloudflare-worker/.
  apiGatewayUrl: '',
  byteplusBaseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3'
};

// Backward-compatible aliases for older cached HTML builds.
window.PICASSO_FIREBASE_CONFIG = window.MAGIC_FIREBASE_CONFIG;
window.PICASSO_APP_CONFIG = window.MAGIC_APP_CONFIG;
