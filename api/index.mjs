// vercel.json sends every /api path here, including nested job and owner routes.
// Express dispatches the original request URL using the same routes as localhost.
export { default } from '../server/app.mjs';
