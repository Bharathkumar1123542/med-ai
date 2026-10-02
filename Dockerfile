# med-ai — production image
# Expects `npm run build` to have already produced ./dist (see deploy.sh step 2).
# We don't build inside the image because Vite bakes VITE_* secrets in at build
# time — building on the host keeps those secrets out of any Docker layer/cache.

FROM nginx:1.27-alpine

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1
