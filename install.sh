#!/bin/bash
#
# LifeWiki 安装脚本
# 自动在用户机器上安装 LifeWiki 插件和创建 vault
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
PLUGIN_NAME="lifewiki"
DEFAULT_VAULT_PATH="$HOME/LifeWiki Vault"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 解析参数
VAULT_PATH=""
SKIP_BUILD=false

usage() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -d, --directory <路径>      指定 vault 安装路径"
    echo "  -s, --skip-build            跳过 npm build (使用已编译的 main.js)"
    echo "  -h, --help                  显示帮助"
    echo ""
    echo "示例:"
    echo "  $0                                    # 交互式选择安装路径"
    echo "  $0 -d \"/Users/me/docs/lifewiki\"       # 安装到指定路径"
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

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--directory)
            VAULT_PATH="$2"
            shift 2
            ;;
        -s|--skip-build)
            SKIP_BUILD=true
            shift
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

# 设置默认值
if [ -z "$VAULT_PATH" ]; then
    VAULT_PATH="$DEFAULT_VAULT_PATH"
fi

# 如果指定了目录路径，展开 ~ 和相对路径
if [ -n "$VAULT_PATH" ]; then
    VAULT_PATH="${VAULT_PATH/#\~/$HOME}"
    VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" && pwd)/$(basename "$VAULT_PATH")"
fi

# 检查系统
check_system() {
    log_info "检查系统环境..."

    if [[ "$OSTYPE" != "darwin"* ]]; then
        log_error "此脚本仅支持 macOS"
        exit 1
    fi

    # 检查 Obsidian 是否安装
    if [ ! -d "/Applications/Obsidian.app" ]; then
        log_error "未找到 Obsidian。请先安装 Obsidian: https://obsidian.md"
        exit 1
    fi

    log_info "系统检查通过"
}

# 询问用户 vault 路径
ask_vault_path() {
    if [ -n "$VAULT_PATH" ]; then
        # 命令行已指定，使用命令行参数
        return 0
    fi

    echo ""
    echo "========================================"
    echo "       配置 Vault 安装路径"
    echo "========================================"
    echo ""
    echo "LifeWiki 需要一个 Obsidian Vault 来存储你的日记和笔记"
    echo ""
    echo "默认安装路径: ${DEFAULT_VAULT_PATH}"
    echo ""
    read -p "请输入 Vault 安装路径 (直接回车使用默认路径): " -r VAULT_PATH
    echo

    if [ -z "$VAULT_PATH" ]; then
        VAULT_PATH="$DEFAULT_VAULT_PATH"
    fi

    # 展开 ~ 并转为绝对路径
    VAULT_PATH="${VAULT_PATH/#\~/$HOME}"
    VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" && pwd)/$(basename "$VAULT_PATH")"
}

# 检查并安装/升级 Obsidian
check_obsidian() {
    log_info "检查 Obsidian 版本..."

    local MIN_VERSION="1.5.0"

    # 从 Info.plist 获取 Obsidian 版本
    local obsidian_version=$(defaults read "/Applications/Obsidian.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "")

    if [ -z "$obsidian_version" ]; then
        log_warn "无法获取 Obsidian 版本，假设版本符合要求"
        return 0
    fi

    log_info "Obsidian 版本: ${obsidian_version}"

    # 比较版本: obsidian_version >= MIN_VERSION 返回 0
    if [ "$(printf '%s\n%s\n' "$MIN_VERSION" "$obsidian_version" | sort -V | head -n1)" = "$MIN_VERSION" ]; then
        if [ "$obsidian_version" = "$MIN_VERSION" ]; then
            log_info "Obsidian 版本符合要求 (${obsidian_version})"
        else
            log_info "Obsidian 版本符合要求 (>= ${MIN_VERSION})"
        fi
        return 0
    fi

    # 版本不符合要求
    echo ""
    echo "========================================"
    log_warn "Obsidian 版本过低: ${obsidian_version}"
    echo "========================================"
    echo ""
    echo "LifeWiki 需要 Obsidian ${MIN_VERSION} 或更高版本。"
    echo ""
    echo "你当前版本: ${obsidian_version}"
    echo ""

    read -p "是否现在自动升级 Obsidian? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "你可以手动升级 Obsidian: https://obsidian.md"
        exit 0
    fi

    # 通过 Homebrew 安装/升级 Obsidian
    if ! command -v brew &> /dev/null; then
        log_info "正在安装 Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(brew shellenv)"
    fi

    log_info "正在升级 Obsidian..."
    brew upgrade --cask obsidian

    # 验证新版本
    local new_version=$(defaults read "/Applications/Obsidian.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "")
    if [ -n "$new_version" ]; then
        log_info "Obsidian 版本: ${new_version}"
    fi
}

# 检查并安装依赖
check_dependencies() {
    log_info "检查依赖环境..."

    # 检查 Node.js
    if command -v node &> /dev/null; then
        log_info "Node.js: $(node --version)"
    else
        log_warn "未找到 Node.js"
    fi

    # 检查 npm
    if command -v npm &> /dev/null; then
        log_info "npm: $(npm --version)"
    else
        log_warn "未找到 npm"
    fi

    # 如果都存在，跳过
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        log_info "依赖检查通过"
        return 0
    fi

    # 缺少依赖，自动安装
    echo ""
    echo "========================================"
    log_warn "缺少必要依赖"
    echo "========================================"
    echo ""
    echo "LifeWiki 插件需要 Node.js 来构建项目。"
    echo ""

    read -p "是否现在自动安装? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "安装取消。你可以稍后手动安装后重新运行此脚本"
        exit 0
    fi

    # 检查并安装 Homebrew
    if ! command -v brew &> /dev/null; then
        log_info "正在安装 Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    # 检查 Homebrew 是否安装成功
    if ! command -v brew &> /dev/null; then
        log_error "Homebrew 安装失败，请手动安装 Node.js: https://nodejs.org"
        exit 1
    fi

    # 初始化 Homebrew
    eval "$(brew shellenv)"

    # 安装 Node.js
    log_info "正在安装 Node.js..."
    brew install node

    # 验证安装
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        log_info "依赖安装成功!"
        log_info "Node.js: $(node --version)"
        log_info "npm: $(npm --version)"
    else
        log_error "依赖安装失败，请手动安装 Node.js: https://nodejs.org"
        exit 1
    fi
}

# 创建 vault 目录结构
create_vault() {
    log_info "创建 Vault: ${VAULT_PATH}"

    if [ -d "$VAULT_PATH" ]; then
        log_warn "Vault 已存在: ${VAULT_PATH}"
        read -p "是否继续安装插件到现有 vault? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "安装取消"
            exit 0
        fi
    else
        mkdir -p "$VAULT_PATH"
        log_info "创建目录: ${VAULT_PATH}"
    fi

    # 创建目录结构
    mkdir -p "${VAULT_PATH}/journal"
    mkdir -p "${VAULT_PATH}/People"
    mkdir -p "${VAULT_PATH}/Projects"
    mkdir -p "${VAULT_PATH}/Things"
    mkdir -p "${VAULT_PATH}/Ideas"
    mkdir -p "${VAULT_PATH}/Knowledge"

    # 创建 .obsidian 配置目录
    mkdir -p "${VAULT_PATH}/.obsidian"

    # 创建初始日记文件
    TODAY=$(date +%Y-%m-%d)
    if [ ! -f "${VAULT_PATH}/journal/${TODAY}.md" ]; then
        cat > "${VAULT_PATH}/journal/${TODAY}.md" << 'EOF'
---
uid: {{DATE:YYYYMMDDHHmmss}}
tags: []
---

# {{DATE:YYYY-MM-DD}}

## 日记

EOF
        log_info "创建今日日记: journal/${TODAY}.md"
    fi

    log_info "Vault 创建完成: ${VAULT_PATH}"
    echo "$VAULT_PATH"
}

# 安装插件
install_plugin() {
    log_info "安装 LifeWiki 插件..."

    # 安装到 vault 的 .obsidian/plugins 目录
    PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_NAME}"

    # 创建插件目录
    mkdir -p "$PLUGIN_DIR"

    # 复制插件文件
    if [ "$SKIP_BUILD" = true ]; then
        log_info "复制预编译的插件文件..."
        cp "${SCRIPT_DIR}/main.js" "$PLUGIN_DIR/"
        cp "${SCRIPT_DIR}/main.css" "$PLUGIN_DIR/"
    else
        log_info "复制源码文件..."
        cp "${SCRIPT_DIR}/src" "$PLUGIN_DIR/" -r 2>/dev/null || true
        cp "${SCRIPT_DIR}/main.js" "$PLUGIN_DIR/" 2>/dev/null || true
        cp "${SCRIPT_DIR}/main.css" "$PLUGIN_DIR/" 2>/dev/null || true
    fi

    cp "${SCRIPT_DIR}/manifest.json" "$PLUGIN_DIR/"

    # 检查必要文件
    if [ ! -f "$PLUGIN_DIR/main.js" ]; then
        log_error "main.js 复制失败"
        exit 1
    fi

    if [ ! -f "$PLUGIN_DIR/manifest.json" ]; then
        log_error "manifest.json 复制失败"
        exit 1
    fi

    log_info "插件安装完成: ${PLUGIN_DIR}"
}

# 启用插件
enable_plugin() {
    log_info "插件已安装到 vault"

    PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/${PLUGIN_NAME}"

    if [ -d "$PLUGIN_DIR" ]; then
        log_info "插件目录: ${PLUGIN_DIR}"
    fi

    # 提示用户手动启用
    log_warn "请在 Obsidian 中启用插件: 设置 → 社区插件 → 启用 LifeWiki"
}

# 打开 Obsidian
open_obsidian() {
    log_info "准备启动 Obsidian..."

    # 检查 vault 是否已在 Obsidian 中注册
    # 如果是第一次，Obsidian 会提示选择 vault

    echo ""
    echo "========================================"
    log_info "安装完成!"
    echo "========================================"
    echo ""
    echo "下一步:"
    echo "1. Obsidian 将自动打开"
    echo "2. 如果提示选择 vault，选择: ${VAULT_PATH}"
    echo "3. 前往 设置 → 社区插件 → 启用 LifeWiki"
    echo ""
    echo "或在终端运行以下命令直接打开:"
    echo "  open \"${VAULT_PATH}\" -a Obsidian"
    echo ""

    read -p "是否现在打开 Obsidian? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$VAULT_PATH" -a Obsidian
    fi
}

# 主流程
main() {
    echo ""
    echo "========================================"
    echo "       LifeWiki 安装脚本"
    echo "========================================"
    echo ""

    check_system
    check_obsidian
    check_dependencies
    ask_vault_path
    create_vault
    install_plugin
    enable_plugin
    open_obsidian

    log_info "安装脚本执行完成"
}

main "$@"
