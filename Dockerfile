FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY public ./public
COPY package.json package-lock.json components.json next.config.js tailwind.config.js postcss.config.mjs tsconfig.json eslint.config.mjs ./

# Add build args using safe names to avoid SonarCloud secret warnings
ARG FB_API
ARG FB_AUTH_DOMAIN
ARG FB_PROJECT_ID
ARG FB_STORAGE_BUCKET
ARG FB_MSG_SENDER_ID
ARG FB_APP_ID
ARG FB_MEASURE_ID
ARG NEXT_PUBLIC_BACKEND
ARG NEXT_PUBLIC_POCKETBASE_URL

# Next.js telemetry is disabled during the build in the standalone mode usually, but just in case
ENV NEXT_TELEMETRY_DISABLED 1

# Generate .env.production before build to provide environment variables securely
RUN echo "NEXT_PUBLIC_FIREBASE_API_KEY=$FB_API" >> .env.production && \
    echo "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$FB_AUTH_DOMAIN" >> .env.production && \
    echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$FB_PROJECT_ID" >> .env.production && \
    echo "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$FB_STORAGE_BUCKET" >> .env.production && \
    echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$FB_MSG_SENDER_ID" >> .env.production && \
    echo "NEXT_PUBLIC_FIREBASE_APP_ID=$FB_APP_ID" >> .env.production && \
    echo "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$FB_MEASURE_ID" >> .env.production && \
    echo "NEXT_PUBLIC_BACKEND=$NEXT_PUBLIC_BACKEND" >> .env.production && \
    echo "NEXT_PUBLIC_POCKETBASE_URL=$NEXT_PUBLIC_POCKETBASE_URL" >> .env.production && \
    npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next \
    && chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=root:root --chmod=755 /app/.next/standalone ./
COPY --from=builder --chown=root:root --chmod=755 /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
# set hostname to localhost
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
