#!/usr/bin/env python3
"""检查 GitHub Actions 最近的运行状态"""
import subprocess
import requests
import sys

OWNER = "flier3186"
REPO = "exploratory-learning"

def get_token():
    try:
        result = subprocess.run(
            ["git", "credential", "fill"],
            input=b"protocol=https\nhost=github.com\n",
            capture_output=True,
            timeout=10,
        )
        for line in result.stdout.decode().split("\n"):
            if line.startswith("password="):
                return line.split("=", 1)[1]
    except Exception:
        pass
    return None

def main():
    token = get_token()
    if not token:
        print("✗ 无法获取 token")
        sys.exit(1)

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
    }

    r = requests.get(
        f"https://api.github.com/repos/{OWNER}/{REPO}/actions/runs?per_page=10",
        headers=headers,
        timeout=30,
    )
    runs = r.json().get("workflow_runs", [])

    print(f"最近 {len(runs)} 次运行:")
    for run in runs[:10]:
        print(f"  {run['name']} | {run['status']} | {run.get('conclusion','')} | {run['created_at']}")

    # 统计成功/失败
    completed = [r for r in runs if r['status'] == 'completed']
    success = [r for r in completed if r['conclusion'] == 'success']
    failed = [r for r in completed if r['conclusion'] == 'failure']
    in_progress = [r for r in runs if r['status'] != 'completed']

    print(f"\n总计: {len(completed)} 完成 ({len(success)} 成功, {len(failed)} 失败), {len(in_progress)} 进行中")

    if failed:
        print("\n最近一次失败的详情:")
        latest_fail = failed[0]
        print(f"  Run ID: {latest_fail['id']}")
        print(f"  Message: {latest_fail.get('display_title','')}")

if __name__ == "__main__":
    main()
