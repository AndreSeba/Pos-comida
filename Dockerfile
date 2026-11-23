# Imagen de producción: una sola aplicación (la API de C# entrega también el frontend compilado).
# Render la construye con este archivo; se prueba local con:  docker build -t pos-comida .

# 1) Frontend (pnpm, con los scripts de instalación de dependencias bloqueados por defecto)
FROM node:22-alpine AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# 2) API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY api/ ./
RUN dotnet publish src/PosComida.Api/PosComida.Api.csproj -c Release -o /app --no-self-contained
COPY --from=web /web/dist /app/wwwroot

# 3) Imagen final
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app ./
ENV ASPNETCORE_ENVIRONMENT=Production
# Render indica el puerto en $PORT (por defecto 10000)
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-10000} exec dotnet PosComida.Api.dll"]
