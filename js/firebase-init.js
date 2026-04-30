import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGjn_z8GiZDWN3xl9odQMpBJF5TiSV1wo",
  authDomain: "el-burdel.firebaseapp.com",
  databaseURL: "https://el-burdel-default-rtdb.firebaseio.com",
  projectId: "el-burdel",
  storageBucket: "el-burdel.firebasestorage.app",
  messagingSenderId: "566378247957",
  appId: "1:566378247957:web:bfd3286e72b7092985db1c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { auth, db };
