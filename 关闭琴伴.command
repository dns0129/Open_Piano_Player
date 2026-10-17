#!/bin/bash
cd "$(dirname "$0")" || exit 1
pids=$(/usr/sbin/lsof -nP -tiTCP:8792 -sTCP:LISTEN 2>/dev/null)
if [ -z "$pids" ]; then
  echo "琴伴未在运行。"
  exit 0
fi
for pid in $pids; do
  process_dir=$(/usr/sbin/lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p')
  if [ "$process_dir" != "$PWD" ]; then
    echo "8792 端口由其他目录的程序使用，未关闭：$process_dir"
    exit 1
  fi
done
kill -TERM $pids || exit 1
for i in {1..20}; do
  if ! /usr/sbin/lsof -nP -tiTCP:8792 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "琴伴本机服务已关闭，可以关闭网页标签。"
    exit 0
  fi
  sleep 0.5
done
echo "已发送关闭请求，服务仍在处理未完成的任务，请稍后重试。"
exit 1
