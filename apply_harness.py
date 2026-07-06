#!/usr/bin/env python3
import os
import sys
import shutil
import argparse

HARNESS_REPO_URL = "https://github.com/revfactory/harness-100.git"
HARNESS_DIR = ".harness-100"
AGENTS_DIR = ".agents"

def ensure_repo():
    if not os.path.exists(HARNESS_DIR):
        print(f"하네스 100 저장소를 {HARNESS_DIR} 에 클론합니다...")
        os.system(f"git clone {HARNESS_REPO_URL} {HARNESS_DIR}")
    else:
        print("하네스 100 저장소 최신화 중...")
        os.system(f"cd {HARNESS_DIR} && git pull origin main")

def get_harness_path(harness_query):
    ko_dir = os.path.join(HARNESS_DIR, "ko")
    if not os.path.exists(ko_dir):
        return None
    
    for dirname in os.listdir(ko_dir):
        if dirname.startswith(harness_query) or harness_query in dirname:
            return os.path.join(ko_dir, dirname)
    return None

def apply_harness(harness_path):
    harness_name = os.path.basename(harness_path)
    claude_dir = os.path.join(harness_path, ".claude")
    
    if not os.path.exists(claude_dir):
        print(f"오류: {harness_name}에 .claude 폴더가 없습니다.")
        return False
        
    print(f"\n[{harness_name}] 하네스를 .agents 에 적용합니다...")
    
    # 1. Agents 복사
    src_agents = os.path.join(claude_dir, "agents")
    dest_agents = os.path.join(AGENTS_DIR, "agents")
    os.makedirs(dest_agents, exist_ok=True)
    
    if os.path.exists(src_agents):
        for file in os.listdir(src_agents):
            if file.endswith(".md"):
                shutil.copy2(os.path.join(src_agents, file), os.path.join(dest_agents, file))
                print(f"  + 에이전트 추가: {file}")
                
    # 2. Skills 복사 및 skill.md -> SKILL.md 변환
    src_skills = os.path.join(claude_dir, "skills")
    dest_skills = os.path.join(AGENTS_DIR, "skills")
    os.makedirs(dest_skills, exist_ok=True)
    
    if os.path.exists(src_skills):
        for skill_dir in os.listdir(src_skills):
            src_skill_path = os.path.join(src_skills, skill_dir)
            if os.path.isdir(src_skill_path):
                dest_skill_path = os.path.join(dest_skills, skill_dir)
                os.makedirs(dest_skill_path, exist_ok=True)
                
                # 내부 파일 복사
                for item in os.listdir(src_skill_path):
                    s_item = os.path.join(src_skill_path, item)
                    d_item = os.path.join(dest_skill_path, item)
                    
                    if os.path.isdir(s_item):
                        if os.path.exists(d_item):
                            shutil.rmtree(d_item)
                        shutil.copytree(s_item, d_item)
                    else:
                        # skill.md -> SKILL.md 변환
                        if item.lower() == "skill.md":
                            d_item = os.path.join(dest_skill_path, "SKILL.md")
                        shutil.copy2(s_item, d_item)
                print(f"  + 스킬 추가: {skill_dir}/SKILL.md")
                
    print(f"\n성공: {harness_name} 하네스 적용 완료!")
    return True

def main():
    parser = argparse.ArgumentParser(description="Harness 100 적용 스크립트")
    parser.add_argument("harness", nargs="?", help="적용할 하네스 번호나 이름 (예: 16 또는 youtube)")
    parser.add_argument("--list", action="store_true", help="사용 가능한 하네스 목록 출력")
    
    args = parser.parse_args()
    
    ensure_repo()
    
    if args.list:
        print("\n=== 사용 가능한 하네스 (ko) ===")
        ko_dir = os.path.join(HARNESS_DIR, "ko")
        harnesses = sorted([d for d in os.listdir(ko_dir) if os.path.isdir(os.path.join(ko_dir, d))])
        for h in harnesses:
            print(f" - {h}")
        return
        
    if not args.harness:
        parser.print_help()
        print("\n사용 예시:")
        print("  python3 apply_harness.py 16")
        print("  python3 apply_harness.py fullstack")
        return
        
    harness_path = get_harness_path(args.harness)
    if not harness_path:
        print(f"오류: '{args.harness}'에 해당하는 하네스를 찾을 수 없습니다.")
        sys.exit(1)
        
    apply_harness(harness_path)

if __name__ == "__main__":
    main()
