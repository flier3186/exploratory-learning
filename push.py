#!/usr/bin/env python3
"""
GitHub 推送脚本 - 当 git push 因网络问题无法使用时的替代方案

用法:
  python push.py "commit message"          # 推送所有变更
  python push.py "commit message" --all     # 推送所有文件（包括未跟踪的）
  python push.py                             # 不带 message，使用默认消息
"""

import subprocess
import sys
import os
import base64
import requests

# 配置
OWNER = "flier3186"
REPO = "exploratory-learning"
BRANCH = "main"
# 从 git credential 获取 token
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
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    # 获取 commit message
    message = "update: push changes"
    push_all = False
    args = sys.argv[1:]
    if args:
        if "--all" in args:
            push_all = True
            args.remove("--all")
        if args:
            message = args[0]

    # 获取 token
    token = get_token()
    if not token:
        print("✗ 无法获取 GitHub token，请先运行: git credential fill")
        sys.exit(1)

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    # 获取变更的文件
    if push_all:
        # 推送所有 git 跟踪的文件
        result = subprocess.run(
            ["git", "ls-files"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        changed_files = [f for f in result.stdout.strip().split("\n") if f]
    else:
        # 只推送有变更的文件
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        changed_files = [f for f in result.stdout.strip().split("\n") if f]

        # 也检查暂存区
        result_staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        staged_files = [f for f in result_staged.stdout.strip().split("\n") if f]
        changed_files = list(set(changed_files + staged_files))

    if not changed_files:
        print("✓ 没有需要推送的变更")
        return

    print(f"找到 {len(changed_files)} 个变更文件:")
    for f in changed_files:
        print(f"  - {f}")

    # 获取远程最新 commit SHA
    response = requests.get(
        f"https://api.github.com/repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}",
        headers=headers,
        timeout=30,
    )
    if response.status_code != 200:
        print(f"✗ 无法获取远程分支信息: {response.status_code}")
        sys.exit(1)
    remote_sha = response.json()["object"]["sha"]
    print(f"\n远程最新 commit: {remote_sha[:8]}")

    # 逐个更新文件
    success = 0
    failed = 0
    for filepath in changed_files:
        full_path = os.path.join(project_dir, filepath.replace("/", os.sep))
        if not os.path.exists(full_path):
            print(f"  ✗ {filepath}: 文件不存在（可能已删除），跳过")
            failed += 1
            continue

        with open(full_path, "rb") as f:
            content_bytes = f.read()
        content_b64 = base64.b64encode(content_bytes).decode("utf-8")

        # 获取文件当前 SHA（如果存在）
        file_response = requests.get(
            f"https://api.github.com/repos/{OWNER}/{REPO}/contents/{filepath}?ref={BRANCH}",
            headers=headers,
            timeout=30,
        )
        file_sha = None
        if file_response.status_code == 200:
            file_sha = file_response.json().get("sha")

        # 更新文件
        update_data = {
            "message": f"{message}: {filepath}",
            "content": content_b64,
            "branch": BRANCH,
        }
        if file_sha:
            update_data["sha"] = file_sha

        update_response = requests.put(
            f"https://api.github.com/repos/{OWNER}/{REPO}/contents/{filepath}",
            headers=headers,
            json=update_data,
            timeout=60,
        )

        if update_response.status_code in (200, 201):
            print(f"  ✓ {filepath}")
            success += 1
        else:
            print(f"  ✗ {filepath}: {update_response.status_code} {update_response.text[:100]}")
            failed += 1

    print(f"\n完成: {success} 成功, {failed} 失败")

    # 同步本地 git 到远程
    print("\n同步本地 git 状态...")
    subprocess.run(["git", "fetch", "origin", BRANCH], capture_output=True, timeout=30)
    subprocess.run(["git", "reset", "--soft", f"origin/{BRANCH}"], capture_output=True, timeout=10)

    if failed == 0:
        print(f"✓ 全部推送成功！GitHub Actions 将自动触发部署")
        print(f"  部署进度: https://github.com/{OWNER}/{REPO}/actions")
        print(f"  线上地址: https://exploratory-learning.pages.dev/")
    else:
        print(f"⚠ 有 {failed} 个文件推送失败，请检查上方日志")

if __name__ == "__main__":
    main()
