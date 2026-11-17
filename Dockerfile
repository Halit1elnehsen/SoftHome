FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/SoftHome.Api/SoftHome.Api.csproj backend/SoftHome.Api/
RUN dotnet restore backend/SoftHome.Api/SoftHome.Api.csproj
COPY backend/SoftHome.Api/ backend/SoftHome.Api/
COPY frontend/ frontend/
RUN dotnet publish backend/SoftHome.Api/SoftHome.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080 DataDirectory=/app/data
RUN chmod -R a+rX /app && mkdir -p /app/data && chown "$APP_UID" /app/data
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "SoftHome.Api.dll"]
