#!/usr/bin/env bash
#
# LifeWiki v2.0 installer
# Creates or updates an Obsidian vault and installs the LifeWiki plugin.
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PLUGIN_ID="lifewiki"
PLUGIN_NAME="LifeWiki"
VERSION="v2.0"
GITHUB_REPO="d19310/lifewiki"
DEFAULT_VAULT_NAME="LifeWiki"
VAULT_PARENT_DIR="$HOME/Documents"
VAULT_NAME="$DEFAULT_VAULT_NAME"
VAULT_PATH=""
USE_LOCAL=false
OPEN_AFTER_INSTALL=true
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}==>${NC} $1"; }

usage() {
	cat <<EOF
LifeWiki v2.0 安装脚本

用法:
  ./install.sh [选项]

选项:
  -n, --name <名称>       Vault 名称，默认: ${DEFAULT_VAULT_NAME}
  -p, --parent <路径>     Vault 父目录，默认: ${VAULT_PARENT_DIR}
  -v, --vault <路径>      直接指定 Vault 完整路径
  -r, --repo <repo>       GitHub 仓库，默认: ${GITHUB_REPO}
  -t, --tag <tag>         Release tag，默认: ${VERSION}
  -l, --local             使用当前目录本地构建产物安装
  --no-open               安装完成后不自动打开 Obsidian
  -h, --help              显示帮助

示例:
  ./install.sh
  ./install.sh -n "MyLifeWiki"
  ./install.sh -v "\$HOME/Obsidian/LifeWiki"
  ./install.sh -l -v "\$HOME/test-lifewiki-vault"

说明:
  默认从 GitHub Release 下载 main.js、manifest.json、styles.css。
  插件安装目录为 .obsidian/plugins/${PLUGIN_ID}。
EOF
}

expand_path() {
	local input="$1"
	input="${input/#\~/$HOME}"
	if [[ "$input" != /* ]]; then
		input="$(pwd)/$input"
	fi
	local dir
	dir="$(dirname "$input")"
	mkdir -p "$dir"
	echo "$(cd "$dir" && pwd)/$(basename "$input")"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		-n|--name)
			VAULT_NAME="$2"
			shift 2
			;;
		-p|--parent)
			VAULT_PARENT_DIR="${2/#\~/$HOME}"
			shift 2
			;;
		-v|--vault)
			VAULT_PATH="$(expand_path "$2")"
			shift 2
			;;
		-r|--repo)
			GITHUB_REPO="$2"
			shift 2
			;;
		-t|--tag)
			VERSION="$2"
			shift 2
			;;
		-l|--local)
			USE_LOCAL=true
			shift
			;;
		--no-open)
			OPEN_AFTER_INSTALL=false
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			log_error "未知参数: $1"
			usage
			exit 1
			;;
	esac
done

if [[ -z "$VAULT_PATH" ]]; then
	VAULT_PATH="$(expand_path "${VAULT_PARENT_DIR}/${VAULT_NAME}")"
fi

PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_ID}"

check_system() {
	log_step "检查环境"

	if ! command -v curl >/dev/null 2>&1; then
		log_error "未找到 curl，无法下载安装文件"
		exit 1
	fi

	if [[ "$OSTYPE" == "darwin"* ]] && [[ ! -d "/Applications/Obsidian.app" ]]; then
		log_warn "未在 /Applications 找到 Obsidian。安装仍会继续，你可以之后手动打开 vault。"
	fi

	log_info "环境检查完成"
}

confirm_install() {
	echo ""
	echo "========================================"
	echo "       LifeWiki v2.0 安装确认"
	echo "========================================"
	echo ""
	echo "Vault: ${VAULT_PATH}"
	echo "插件目录: ${PLUGIN_DIR}"
	echo "安装来源: $([[ "$USE_LOCAL" == true ]] && echo "本地构建产物" || echo "GitHub Release ${GITHUB_REPO}@${VERSION}")"
	echo ""
	read -r -p "确认开始安装? (y/n) " reply
	if [[ ! "$reply" =~ ^[Yy]$ ]]; then
		log_info "安装取消"
		exit 0
	fi
}

create_vault_structure() {
	log_step "准备 Vault 目录结构"

	mkdir -p "$VAULT_PATH"
	mkdir -p "$PLUGIN_DIR"
	mkdir -p "${VAULT_PATH}/.obsidian"

	mkdir -p "${VAULT_PATH}/Daily"
	mkdir -p "${VAULT_PATH}/People"
	mkdir -p "${VAULT_PATH}/Projects"
	mkdir -p "${VAULT_PATH}/Things"
	mkdir -p "${VAULT_PATH}/Ideas"
	mkdir -p "${VAULT_PATH}/Knowledge"
	mkdir -p "${VAULT_PATH}/Memory/Capsules"
	mkdir -p "${VAULT_PATH}/Memory/Patterns"
	mkdir -p "${VAULT_PATH}/Memory/OpenLoops"

	mkdir -p "${VAULT_PATH}/.lifewiki/index"
	mkdir -p "${VAULT_PATH}/.lifewiki/sessions"
	mkdir -p "${VAULT_PATH}/.lifewiki/agents"
	mkdir -p "${VAULT_PATH}/.lifewiki/skills"
	mkdir -p "${VAULT_PATH}/.lifewiki/templates"

	local today
	today="$(date +%Y-%m-%d)"
	if [[ ! -f "${VAULT_PATH}/Daily/${today}.md" ]]; then
		cat > "${VAULT_PATH}/Daily/${today}.md" <<EOF
---
date: ${today}
tags:
  - lifewiki/daily
---

# ${today}

## 日记

EOF
	fi

	log_info "Vault 目录结构已准备"
}

copy_local_defaults() {
	if [[ -d "${SCRIPT_DIR}/.lifewiki" ]]; then
		cp -R "${SCRIPT_DIR}/.lifewiki/." "${VAULT_PATH}/.lifewiki/"
		log_info "已复制默认 Agent/Skill 配置"
	fi
}

download_release_source_defaults() {
	local tmp_dir archive source_dir
	tmp_dir="$(mktemp -d)"
	archive="${tmp_dir}/source.tar.gz"

	if curl -fsSL "https://codeload.github.com/${GITHUB_REPO}/tar.gz/refs/tags/${VERSION}" -o "$archive"; then
		tar -xzf "$archive" -C "$tmp_dir"
		source_dir="$(find "$tmp_dir" -maxdepth 1 -type d -name '*-*' | head -n 1)"
		if [[ -n "$source_dir" && -d "${source_dir}/.lifewiki" ]]; then
			cp -R "${source_dir}/.lifewiki/." "${VAULT_PATH}/.lifewiki/"
			log_info "已安装默认 Agent/Skill 配置"
		else
			log_warn "Release 源码中未找到 .lifewiki 默认配置，已保留空目录"
		fi
	else
		log_warn "默认配置下载失败，插件仍可安装；首次使用时会创建必要数据"
	fi

	rm -rf "$tmp_dir"
}

install_plugin_local() {
	log_step "安装本地插件文件"

	[[ -f "${SCRIPT_DIR}/main.js" ]] || { log_error "缺少 ${SCRIPT_DIR}/main.js，请先运行 npm run build"; exit 1; }
	[[ -f "${SCRIPT_DIR}/manifest.json" ]] || { log_error "缺少 manifest.json"; exit 1; }

	cp "${SCRIPT_DIR}/main.js" "${PLUGIN_DIR}/main.js"
	cp "${SCRIPT_DIR}/manifest.json" "${PLUGIN_DIR}/manifest.json"

	if [[ -f "${SCRIPT_DIR}/styles.css" ]]; then
		cp "${SCRIPT_DIR}/styles.css" "${PLUGIN_DIR}/styles.css"
	elif [[ -f "${SCRIPT_DIR}/main.css" ]]; then
		cp "${SCRIPT_DIR}/main.css" "${PLUGIN_DIR}/styles.css"
	fi

	copy_local_defaults
}

download_asset() {
	local asset="$1"
	local target="$2"
	local url="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${asset}"
	curl -fsSL "$url" -o "$target"
}

install_plugin_from_release() {
	log_step "从 GitHub Release 安装插件"

	download_asset "main.js" "${PLUGIN_DIR}/main.js" || { log_error "main.js 下载失败"; exit 1; }
	download_asset "manifest.json" "${PLUGIN_DIR}/manifest.json" || { log_error "manifest.json 下载失败"; exit 1; }

	if ! download_asset "styles.css" "${PLUGIN_DIR}/styles.css"; then
		log_warn "styles.css 下载失败，继续安装无样式版本"
	fi

	download_release_source_defaults
}

enable_plugin_if_safe() {
	local plugins_file="${VAULT_PATH}/.obsidian/community-plugins.json"

	if [[ ! -f "$plugins_file" ]]; then
		printf '[\n  "%s"\n]\n' "$PLUGIN_ID" > "$plugins_file"
		log_info "已在新 vault 中预启用 LifeWiki"
		return
	fi

	if grep -q "\"${PLUGIN_ID}\"" "$plugins_file"; then
		log_info "LifeWiki 已在社区插件列表中"
	else
		log_warn "检测到已有社区插件配置。为避免破坏配置，请在 Obsidian 中手动启用 LifeWiki。"
	fi
}

show_completion() {
	echo ""
	echo "========================================"
	log_info "LifeWiki v2.0 安装完成"
	echo "========================================"
	echo ""
	echo "Vault: ${VAULT_PATH}"
	echo "插件: ${PLUGIN_DIR}"
	echo ""
	echo "下一步:"
	echo "1. 打开 Obsidian vault"
	echo "2. 如未自动启用：设置 → 社区插件 → LifeWiki → 启用"
	echo "3. 打开 LifeWiki 设置，为 Diary Agent 和 Chat Agent 配置 AI Provider"
	echo ""
}

main() {
	echo ""
	echo "========================================"
	echo "       LifeWiki v2.0 安装向导"
	echo "========================================"

	check_system
	confirm_install
	create_vault_structure

	if [[ "$USE_LOCAL" == true ]]; then
		install_plugin_local
	else
		install_plugin_from_release
	fi

	enable_plugin_if_safe
	show_completion

	if [[ "$OPEN_AFTER_INSTALL" == true && "$OSTYPE" == "darwin"* ]]; then
		open "$VAULT_PATH" -a Obsidian >/dev/null 2>&1 || true
	fi
}

main "$@"
