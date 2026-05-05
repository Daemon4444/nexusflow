#!/bin/bash
# AI Router Platform 启动脚本

BACKEND_DIR="/root/distiny/ai-router-platform/backend"
FRONTEND_DIR="/root/distiny/ai-router-platform/frontend"
BACKEND_PID_FILE="/tmp/ai-router-backend.pid"
FRONTEND_PID_FILE="/tmp/ai-router-frontend.pid"

stop_services() {
  if [ -f "$BACKEND_PID_FILE" ]; then
    kill $(cat "$BACKEND_PID_FILE") 2>/dev/null
    rm -f "$BACKEND_PID_FILE"
  fi
  if [ -f "$FRONTEND_PID_FILE" ]; then
    kill $(cat "$FRONTEND_PID_FILE") 2>/dev/null
    rm -f "$FRONTEND_PID_FILE"
  fi
  sleep 2
}

start_backend() {
  echo "启动后端..."
  cd "$BACKEND_DIR"
  PORT="${PORT:-3001}" nohup npx ts-node --project tsconfig.json src/index.ts \
    > /tmp/backend.log 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
  echo "后端 PID: $(cat $BACKEND_PID_FILE)"
}

start_frontend() {
  echo "启动前端..."
  cd "$FRONTEND_DIR"
  nohup npx next start -H 0.0.0.0 -p 19999 > /tmp/frontend.log 2>&1 &
  echo $! > "$FRONTEND_PID_FILE"
  echo "前端 PID: $(cat $FRONTEND_PID_FILE)"
}

case "${1:-start}" in
  start)
    stop_services
    start_backend
    sleep 3
    start_frontend
    sleep 3
    echo ""
    echo "=== 服务状态 ==="
    curl -s http://localhost:3001/api/health && echo ""
    curl -s -o /dev/null -w "前端: HTTP %{http_code}\n" http://localhost:19999/
    echo ""
    echo "前端: http://8.131.68.6:9999"
    echo "后端: http://8.131.68.6:3001"
    ;;
  stop)
    stop_services
    echo "服务已停止"
    ;;
  restart)
    $0 stop
    $0 start
    ;;
  *)
    echo "用法: $0 {start|stop|restart}"
    ;;
esac
