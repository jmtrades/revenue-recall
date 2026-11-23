# Free host. No Vercel account and no Supabase project: the app keeps its
# data in a SQLite file under /data and runs its own minute/hour scheduler.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV FREE_DB_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
CMD ["npm", "start"]
