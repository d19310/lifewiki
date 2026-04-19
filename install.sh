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
    VAULT_PATH=$(create_vault)
    install_plugin
    enable_plugin
    open_obsidian

    log_info "安装脚本执行完成"
}

main "$@"
