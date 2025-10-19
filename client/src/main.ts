import axios from 'axios';
import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import './styles/main.scss';

axios.defaults.withCredentials = true;

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');
