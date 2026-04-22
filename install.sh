#!/bin/bash
#
# LifeWiki 安装脚本 v1.4
# 交互式安装 LifeWiki 插件和创建 vault
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
PLUGIN_NAME="lifewiki"
DEFAULT_VAULT_NAME="LifeWiki Vault"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 安装选项
USE_LOCAL=false
USE_BRAT=false
GITHUB_REPO="d19310/lifewiki"
VAULT_PARENT_DIR="$HOME"
VAULT_NAME="$DEFAULT_VAULT_NAME"

usage() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -n, --name <名称>       Vault 名称 (默认: ${DEFAULT_VAULT_NAME})"
    echo "  -p, --parent <路径>     Vault 父目录 (默认: ${HOME})"
    echo "  -b, --brat              使用 BRAT 从 GitHub 安装"
    echo "  -r, --repo <repo>       GitHub 仓库地址 (默认: d19310/lifewiki)"
    echo "  -l, --local             使用本地已构建的文件（跳过下载）"
    echo "  -h, --help              显示帮助"
    echo ""
    echo "说明:"
    echo "  默认从 GitHub 下载预构建的插件文件"
    echo "  -l 模式使用本地已存在的 main.js"
    echo ""
    echo "示例:"
    echo "  $0                                    # 从 GitHub 下载安装"
    echo "  $0 -n \"MyVault\" -p \"~/Documents\"     # 自定义 vault"
    echo "  $0 -l                                 # 使用本地构建文件"
    echo "  $0 -b                                 # 使用 BRAT 从 GitHub 安装"
    exit 1
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}==>${NC} $1"
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            VAULT_NAME="$2"
            shift 2
            ;;
        -p|--parent)
            VAULT_PARENT_DIR="$2"
            shift 2
            ;;
        -l|--local)
            USE_LOCAL=true
            shift
            ;;
        -b|--brat)
            USE_BRAT=true
            shift
            ;;
        -r|--repo)
            GITHUB_REPO="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "未知参数: $1"
            usage
            ;;
    esac
done

# 计算完整 vault 路径
VAULT_PATH="${VAULT_PARENT_DIR}/${VAULT_NAME}"
VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" && pwd)/$(basename "$VAULT_PATH")"

# 检查系统
check_system() {
    log_step "检查系统环境..."

    if [[ "$OSTYPE" != "darwin"* ]]; then
        log_error "此脚本仅支持 macOS"
        exit 1
    fi

    if [ ! -d "/Applications/Obsidian.app" ]; then
        log_error "未找到 Obsidian。请先安装 Obsidian: https://obsidian.md"
        exit 1
    fi

    log_info "系统检查通过 ✓"
    echo ""
}

# 检查 Obsidian 版本
check_obsidian() {
    log_step "检查 Obsidian 版本..."

    local MIN_VERSION="1.5.0"
    local obsidian_version=$(defaults read "/Applications/Obsidian.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "")

    if [ -z "$obsidian_version" ]; then
        log_warn "无法获取 Obsidian 版本，假设版本符合要求"
        return 0
    fi

    log_info "当前版本: ${obsidian_version}"

    if [ "$(printf '%s\n%s\n' "$MIN_VERSION" "$obsidian_version" | sort -V | head -n1)" != "$MIN_VERSION" ]; then
        echo ""
        echo "LifeWiki 需要 Obsidian ${MIN_VERSION} 或更高版本。"
        echo "你当前版本: ${obsidian_version}"
        echo ""
        read -p "是否通过 Homebrew 升级 Obsidian? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "跳过 Obsidian 升级"
        else
            if ! command -v brew &> /dev/null; then
                log_info "安装 Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                eval "$(brew shellenv)"
            fi
            log_info "升级 Obsidian..."
            brew upgrade --cask obsidian
            local new_version=$(defaults read "/Applications/Obsidian.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "")
            [ -n "$new_version" ] && log_info "新版本: ${new_version}"
        fi
    else
        log_info "Obsidian 版本符合要求 ✓"
    fi
    echo ""
}

# 检查依赖
check_dependencies() {
    log_step "检查依赖环境..."

    # 检查 curl (用于下载插件)
    if command -v curl &> /dev/null; then
        log_info "curl: 已安装 ✓"
    else
        log_warn "curl: 未找到"
        echo ""
        echo "LifeWiki 安装脚本需要 curl 来下载插件。"
        echo ""
        read -p "是否通过 Homebrew 安装 curl? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if ! command -v brew &> /dev/null; then
                log_info "安装 Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
                eval "$(brew shellenv)"
            fi
            log_info "安装 curl..."
            brew install curl
        fi
    fi

    # Node.js 仅在本地模式需要
    if [ "$USE_LOCAL" = true ]; then
        if command -v node &> /dev/null; then
            log_info "Node.js: $(node --version) ✓"
        else
            log_warn "Node.js: 未找到 (本地模式需要)"
        fi
    fi

    echo ""
}

# 交互式配置 vault
interactive_config() {
    echo ""
    echo "========================================"
    echo "       配置 Vault"
    echo "========================================"
    echo ""
    echo "Vault 用来存储你的日记和笔记。"
    echo ""
    echo "当前设置:"
    echo "  名称: ${VAULT_NAME}"
    echo "  位置: ${VAULT_PARENT_DIR}"
    echo "  完整路径: ${VAULT_PATH}"
    echo ""
    read -p "是否使用这些设置? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "请输入新的 vault 名称 (直接回车保持默认):"
        read -p "[${DEFAULT_VAULT_NAME}] " -r VAULT_NAME_INPUT
        if [ -n "$VAULT_NAME_INPUT" ]; then
            VAULT_NAME="$VAULT_NAME_INPUT"
        fi

        echo ""
        echo "请输入 vault 父目录路径 (直接回车保持默认):"
        read -p "[${HOME}] " -r VAULT_PARENT_INPUT
        if [ -n "$VAULT_PARENT_INPUT" ]; then
            VAULT_PARENT_DIR="${VAULT_PARENT_INPUT/#\~/$HOME}"
        fi

        VAULT_PATH="${VAULT_PARENT_DIR}/${VAULT_NAME}"
        VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" && pwd)/$(basename "$VAULT_PATH")"

        echo ""
        log_info "新的 Vault 路径: ${VAULT_PATH}"
    fi
    echo ""
}

# 创建 vault
create_vault() {
    log_step "准备创建 Vault..."

    if [ -d "$VAULT_PATH" ]; then
        log_warn "Vault 已存在: ${VAULT_PATH}"
        echo ""
        read -p "是否继续安装插件到现有 vault? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "安装取消"
            exit 0
        fi
        log_info "将插件安装到现有 vault"
    else
        echo ""
        read -p "确认创建新 Vault: ${VAULT_PATH} ? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "安装取消"
            exit 0
        fi

        log_info "创建 Vault..."
        mkdir -p "$VAULT_PATH"
        log_info "Vault 创建成功 ✓"
    fi

    # 创建目录结构
    mkdir -p "${VAULT_PATH}/Daily"
    mkdir -p "${VAULT_PATH}/People"
    mkdir -p "${VAULT_PATH}/Projects"
    mkdir -p "${VAULT_PATH}/Things"
    mkdir -p "${VAULT_PATH}/Ideas"
    mkdir -p "${VAULT_PATH}/Knowledge"
    mkdir -p "${VAULT_PATH}/.lifewiki/agents"
    mkdir -p "${VAULT_PATH}/.lifewiki/sessions"
    mkdir -p "${VAULT_PATH}/.lifewiki/templates"
    mkdir -p "${VAULT_PATH}/.lifewiki/skills"
    mkdir -p "${VAULT_PATH}/.obsidian"

    log_info "目录结构创建完成 ✓"

    # 创建今日日记
    TODAY=$(date +%Y-%m-%d)
    if [ ! -f "${VAULT_PATH}/Daily/${TODAY}.md" ]; then
        cat > "${VAULT_PATH}/Daily/${TODAY}.md" << 'EOF'
---
uid: {{DATE:YYYYMMDDHHmmss}}
tags: []
---

# {{DATE:YYYY-MM-DD}}

## 日记

EOF
        log_info "创建今日日记: Daily/${TODAY}.md ✓"
    fi

    echo ""
}

# 复制配置文件
copy_configs() {
    log_step "复制配置文件..."

    # Agent 配置
    if [ -d "${SCRIPT_DIR}/src/.lifewiki/agents" ]; then
        cp -r "${SCRIPT_DIR}/src/.lifewiki/agents/" "${VAULT_PATH}/.lifewiki/" 2>/dev/null || true
        log_info "Agent 配置 ✓"
    fi

    # Skill 配置
    if [ -d "${SCRIPT_DIR}/.lifewiki/skills" ]; then
        cp -r "${SCRIPT_DIR}/.lifewiki/skills/" "${VAULT_PATH}/.lifewiki/" 2>/dev/null || true
        log_info "Skill 配置 ✓"
    fi

    # 模板
    if [ -d "${SCRIPT_DIR}/src/.lifewiki/templates" ]; then
        cp "${SCRIPT_DIR}/src/.lifewiki/templates/"*.md "${VAULT_PATH}/.lifewiki/templates/" 2>/dev/null || true
        log_info "模板文件 ✓"
    fi

    echo ""
}

# 下载插件文件
download_plugin() {
    log_info "从 GitHub 下载插件..."

    # 构建 GitHub RAW 文件 URL
    local base_url="https://raw.githubusercontent.com/${GITHUB_REPO}/main"

    # 下载 main.js
    log_info "下载 main.js..."
    if ! curl -sL "${base_url}/main.js" -o "${PLUGIN_DIR}/main.js"; then
        log_error "main.js 下载失败"
        return 1
    fi

    # 下载 main.css
    log_info "下载 main.css..."
    curl -sL "${base_url}/main.css" -o "${PLUGIN_DIR}/main.css" 2>/dev/null || true

    # 下载 manifest.json
    log_info "下载 manifest.json..."
    if ! curl -sL "${base_url}/manifest.json" -o "${PLUGIN_DIR}/manifest.json"; then
        log_error "manifest.json 下载失败"
        return 1
    fi

    return 0
}

# 安装插件
install_plugin() {
    log_step "安装 LifeWiki 插件..."

    PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_NAME}"
    mkdir -p "$PLUGIN_DIR"

    if [ "$USE_LOCAL" = true ]; then
        log_info "使用本地构建文件..."
        cp "${SCRIPT_DIR}/main.js" "$PLUGIN_DIR/" || { log_error "main.js 复制失败"; exit 1; }
        cp "${SCRIPT_DIR}/main.css" "$PLUGIN_DIR/" 2>/dev/null || true
        cp "${SCRIPT_DIR}/manifest.json" "$PLUGIN_DIR/" || { log_error "manifest.json 复制失败"; exit 1; }
    else
        # 从 GitHub 下载
        if ! download_plugin; then
            log_warn "下载失败，尝试使用本地文件..."
            if [ -f "${SCRIPT_DIR}/main.js" ]; then
                cp "${SCRIPT_DIR}/main.js" "$PLUGIN_DIR/"
                cp "${SCRIPT_DIR}/main.css" "$PLUGIN_DIR/" 2>/dev/null || true
                cp "${SCRIPT_DIR}/manifest.json" "$PLUGIN_DIR/"
            else
                log_error "无法获取插件文件"
                exit 1
            fi
        fi
    fi

    if [ -f "$PLUGIN_DIR/main.js" ] && [ -f "$PLUGIN_DIR/manifest.json" ]; then
        log_info "插件安装完成 ✓"
    else
        log_error "插件文件缺失"
        exit 1
    fi

    echo ""
}

# BRAT 安装模式
install_brat() {
    log_step "BRAT 安装模式..."

    # 检查 vault
    if [ ! -d "$VAULT_PATH" ]; then
        log_info "创建 Vault: ${VAULT_PATH}"
        mkdir -p "$VAULT_PATH"
        mkdir -p "${VAULT_PATH}/Daily"
        mkdir -p "${VAULT_PATH}/.obsidian"
        mkdir -p "${VAULT_PATH}/.lifewiki/agents"
        mkdir -p "${VAULT_PATH}/.lifewiki/sessions"
        mkdir -p "${VAULT_PATH}/.lifewiki/templates"
        mkdir -p "${VAULT_PATH}/.lifewiki/skills"
    fi
    mkdir -p "${VAULT_PATH}/.obsidian/plugins"

    local brat_path="${VAULT_PATH}/.obsidian/plugins/obsidian42-brat"
    if [ ! -d "$brat_path" ]; then
        echo ""
        echo "请在 Obsidian 中手动安装 BRAT 插件："
        echo "  设置 → 社区插件 → 浏览 → 搜索 'BRAT' → 安装"
        echo ""
        echo "安装完成后重新运行: $0 -b -n \"${VAULT_NAME}\" -p \"${VAULT_PARENT_DIR}\""
        echo ""
        read -p "是否现在打开 Obsidian? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            open "$VAULT_PATH" -a Obsidian
        fi
        exit 0
    fi

    echo ""
    echo "========================================"
    echo "       BRAT 安装步骤"
    echo "========================================"
    echo ""
    echo "1. 在 Obsidian 中打开: ${VAULT_PATH}"
    echo "2. 设置 → 社区插件 → BRAT → 打开设置"
    echo "3. 点击 'Add a beta plugin from a GitHub repository'"
    echo "4. 输入仓库地址: ${GITHUB_REPO}"
    echo "5. 点击 'Add Plugin'"
    echo "6. 返回社区插件列表，启用 LifeWiki"
    echo ""
    read -p "是否现在打开 Obsidian? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$VAULT_PATH" -a Obsidian
    fi
}

# 最终确认并执行
final_summary() {
    echo ""
    echo "========================================"
    echo "       安装确认"
    echo "========================================"
    echo ""
    echo "Vault 路径: ${VAULT_PATH}"
    echo "插件目录: ${VAULT_PATH}/.obsidian/plugins/${PLUGIN_NAME}"
    [ "$SKIP_BUILD" = true ] && echo "模式: 跳过构建 (使用预编译文件)" || echo "模式: 源码模式"
    [ "$USE_BRAT" = true ] && echo "安装方式: BRAT (从 GitHub)"
    echo ""
    read -p "确认开始安装? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "安装取消"
        exit 0
    fi
}

# 完成
show_completion() {
    echo ""
    echo "========================================"
    log_info "安装完成!"
    echo "========================================"
    echo ""
    echo "Vault: ${VAULT_PATH}"
    echo ""
    echo "下一步:"
    echo "1. 在 Obsidian 中打开 vault (如果未自动打开)"
    echo "2. 设置 → 社区插件 → 启用 LifeWiki"
    echo ""
    echo "常用命令:"
    echo "  open \"${VAULT_PATH}\" -a Obsidian"
    echo ""
}

# 主流程
main() {
    echo ""
    echo "========================================"
    echo "       LifeWiki 安装向导"
    echo "========================================"
    echo ""

    # BRAT 模式
    if [ "$USE_BRAT" = true ]; then
        interactive_config
        check_system
        final_summary
        install_brat
        show_completion
        exit 0
    fi

    # 常规模式
    check_system
    check_obsidian
    check_dependencies
    interactive_config
    final_summary

    create_vault
    copy_configs
    install_plugin

    echo ""
    log_info "插件已安装到 vault"
    log_warn "请在 Obsidian 中启用: 设置 → 社区插件 → 启用 LifeWiki"
    echo ""

    read -p "是否现在打开 Obsidian? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$VAULT_PATH" -a Obsidian
    fi

    show_completion
}

main "$@"