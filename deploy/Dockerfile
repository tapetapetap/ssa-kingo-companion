# api와 jobs가 함께 쓰는 이미지(research R16). 명령만 다르다: api는 node server/main.ts, jobs는 node server/cli.ts …
FROM node:24-slim
# 서버와 같은 판의 pg_dump(판이 낮으면 거절된다, R15)와 CPU 온도를 읽는 lm-sensors(R6)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg lm-sensors \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && . /etc/os-release \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get purge -y gnupg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# 분류기가 jsdom(dev 의존성)을 쓰므로 dev까지 받는다
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:ops
ENV NODE_ENV=production
CMD ["node", "server/main.ts"]
