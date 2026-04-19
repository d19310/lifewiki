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
DEFAULT_VAULT_NAME="LifeWiki Vault"
OBSIDIAN_PLUGINS_DIR="$HOME/Library/Application Support/obsidian/plugins"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 解析参数
VAULT_NAME=""
SKIP_BUILD=false

usage() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -v, --vault-name <名称>    指定 vault 名称 (默认: ${DEFAULT_VAULT_NAME})"
    echo "  -s, --skip-build           跳过 npm build (使用已编译的 main.js)"
    echo "  -h, --help                 显示帮助"
    echo ""
    echo "示例:"
    echo "  $0                                    # 使用默认名称安装"
    echo "  $0 -v \"我的日记\"                      # 创建名为\"我的日记\"的 vault"
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
        -v|--vault-name)
            VAULT_NAME="$2"
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
if [ -z "$VAULT_NAME" ]; then
    VAULT_NAME="$DEFAULT_VAULT_NAME"
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

    # 自动下载并安装 Obsidian
    log_info "正在下载最新 Obsidian..."

    local temp_dir="/tmp/lifewiki-obsidian-update"
    local dmg_path="${temp_dir}/Obsidian.dmg"

    rm -rf "$temp_dir"
    mkdir -p "$temp_dir"

    # 从 GitHub 下载最新 DMG
    local download_url="https://github.com/obsidianmd/obsidian-releases/releases/download/latest/obsidian-installer.dmg"
    curl -L -o "$dmg_path" "$download_url" 2>&1 | tail -3

    if [ ! -f "$dmg_path" ] || [ ! -s "$dmg_path" ]; then
        log_error "下载失败，尝试备选方案..."
        # 备选: 直接从 obsidian.md 下载
        download_url="https://obsidian.md/public/obsidian-installer.dmg"
        curl -L -o "$dmg_path" "$download_url" 2>&1 | tail -3
    fi

    if [ ! -f "$dmg_path" ] || [ ! -s "$dmg_path" ]; then
        log_error "下载失败，请手动下载 Obsidian: https://obsidian.md"
        exit 1
    fi

    # 挂载 DMG
    log_info "正在安装 Obsidian..."

    local mount_point="/Volumes/Obsidian"
    hdiutil attach "$dmg_path" -mountpoint "$mount_point" -nobrowse 2>/dev/null

    if [ -d "${mount_point}/Obsidian.app" ]; then
        # 替换应用
        rm -rf "/Applications/Obsidian.app"
        cp -R "${mount_point}/Obsidian.app" "/Applications/"
        log_info "Obsidian 升级成功!"
    else
        log_error "安装失败，请手动下载 Obsidian: https://obsidian.md"
        hdiutil detach "$mount_point" 2>/dev/null
        exit 1
    fi

    # 卸载 DMG
    hdiutil detach "$mount_point" 2>/dev/null
    rm -rf "$temp_dir"

    # 验证新版本
    local new_version=$(defaults read "/Applications/Obsidian.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "")
    if [ -n "$new_version" ]; then
        log_info "当前版本: ${new_version}"
    fi
}

# 检查并安装依赖
check_dependencies() {
    log_info "检查依赖环境..."

    local node_missing=false
    local npm_missing=false

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        node_missing=true
        log_warn "未找到 Node.js"
    else
        local node_version=$(node --version)
        log_info "Node.js: ${node_version}"
    fi

    # 检查 npm
    if ! command -v npm &> /dev/null; then
        npm_missing=true
        log_warn "未找到 npm"
    else
        local npm_version=$(npm --version)
        log_info "npm: ${npm_version}"
    fi

    # 如果都存在，跳过
    if [[ "$node_missing" == false && "$npm_missing" == false ]]; then
        log_info "依赖检查通过，跳过安装"
        return 0
    fi

    # 缺少依赖，提示用户
    echo ""
    echo "========================================"
    log_warn "缺少必要依赖: Node.js 和 npm"
    echo "========================================"
    echo ""
    echo "LifeWiki 插件需要 Node.js 来构建项目。"
    echo ""
    echo "推荐使用 Homebrew 安装 (https://brew.sh):"
    echo "  brew install node"
    echo ""
    echo "或访问 Node.js 官网下载安装包:"
    echo "  https://nodejs.org"
    echo ""

    read -p "是否现在安装 Node.js (通过 Homebrew)? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "安装取消。你可以稍后手动安装 Node.js 后重新运行此脚本"
        exit 0
    fi

    # 检查 Homebrew
    if ! command -v brew &> /dev/null; then
        log_error "未找到 Homebrew。请先安装 Homebrew: https://brew.sh"
        echo "或手动下载 Node.js: https://nodejs.org"
        exit 1
    fi

    log_info "正在安装 Node.js..."
    brew install node

    # 验证安装
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        log_info "依赖安装成功!"
        log_info "Node.js: $(node --version)"
        log_info "npm: $(npm --version)"
    else
        log_error "依赖安装失败，请手动安装 Node.js"
        exit 1
    fi
}

# 创建 vault 目录结构
create_vault() {
    log_info "创建 Vault: ${VAULT_NAME}"

    VAULT_PATH="$HOME/${VAULT_NAME}"

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

    PLUGIN_DIR="${OBSIDIAN_PLUGINS_DIR}/${PLUGIN_NAME}"

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
    log_info "检查插件安装状态..."

    # 检查插件是否已在 Obsidian 中注册
    # 注意: 这个步骤需要用户手动在 Obsidian 中操作，或通过配置文件自动启用

    PLUGIN_DIR="${OBSIDIAN_PLUGINS_DIR}/${PLUGIN_NAME}"

    # 创建 community-plugin-config.json 来自动启用插件
    COMMUNITY_PLUGINS_CONFIG="$HOME/Library/Application Support/obsidian/community-plugin-config.json"

    if [ -f "$COMMUNITY_PLUGINS_CONFIG" ]; then
        log_info "更新社区插件配置..."
        # 简单处理: 添加插件 ID 到已启用的列表
        # 注意: 实际配置是 JSON 格式，需要更复杂的处理
        log_warn "请在 Obsidian 中手动启用插件: 设置 → 社区插件 → 启用 LifeWiki"
    else
        log_warn "请在 Obsidian 中手动启用插件: 设置 → 社区插件 → 启用 LifeWiki"
    fi
}

# 打开 Obsidian
open_obsidian() {
    VAULT_PATH="$HOME/${VAULT_NAME}"

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
    VAULT_PATH=$(create_vault)
    install_plugin
    enable_plugin
    open_obsidian

    log_info "安装脚本执行完成"
}

main "$@"
