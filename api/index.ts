import { vercelApp } from '../worker/vercel.js';

export default {
  fetch(request: Request) {
    return vercelApp.fetch(request, process.env);
  },
};
