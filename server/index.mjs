import { app } from './app.mjs';
export { app };
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL)
  app.listen(Number(process.env.PORT || 8787), '127.0.0.1', () =>
    console.log(`Applicator: http://127.0.0.1:${process.env.PORT || 8787}`),
  );
