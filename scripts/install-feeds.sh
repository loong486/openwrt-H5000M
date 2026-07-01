#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="${ROOT_DIR}/openwrt"

INCLUDE_QMODEM_ORIGINAL="${INCLUDE_QMODEM_ORIGINAL:-${INCLUDE_QMODEM:-false}}"
INCLUDE_QMODEM_NEXT="${INCLUDE_QMODEM_NEXT:-false}"
INCLUDE_PASSWALL2="${INCLUDE_PASSWALL2:-${INCLUDE_PASSWALL:-false}}"
INCLUDE_PASSWALL="${INCLUDE_PASSWALL:-false}"
INCLUDE_MOSDNS="${INCLUDE_MOSDNS:-false}"
INCLUDE_HOMEPROXY="${INCLUDE_HOMEPROXY:-false}"

cd "${SRC_DIR}"

feed_names() {
  awk '/^src-[a-z]+[[:space:]]+/ { print $2 }' feeds.conf.default
}

install_feed_all() {
  local feed="$1"
  echo "Installing all packages from feed: ${feed}"
  ./scripts/feeds install -a -p "${feed}"
}

install_packages() {
  local feed="$1"
  shift

  [ "$#" -gt 0 ] || return 0

  echo "Installing selected packages from feed: ${feed}: $*"
  ./scripts/feeds install -p "${feed}" "$@"
}

for feed in $(feed_names); do
  case "${feed}" in
    small_package)
      echo "Skipping full install for small_package; selected packages are installed below."
      ;;
    qmodem)
      if [ "${INCLUDE_QMODEM_ORIGINAL}" = "true" ] || [ "${INCLUDE_QMODEM_NEXT}" = "true" ]; then
        install_feed_all "${feed}"
        if [ "${INCLUDE_QMODEM_NEXT}" = "true" ]; then
          bash "${ROOT_DIR}/scripts/patch-qmodem-hotplug.sh" "${SRC_DIR}"
        fi
      else
        echo "Skipping qmodem feed because QModem is disabled."
      fi
      ;;
    *)
      install_feed_all "${feed}"
      ;;
  esac
done

if [ "${INCLUDE_PASSWALL2}" = "true" ]; then
  install_packages small_package \
    luci-app-passwall2 \
    xray-core \
    sing-box \
    tcping \
    v2ray-geoip \
    v2ray-geosite \
    v2ray-plugin \
    geoview
fi

if [ "${INCLUDE_PASSWALL}" = "true" ]; then
  install_packages small_package \
    luci-app-passwall \
    xray-core \
    sing-box \
    tcping \
    v2ray-geoip \
    v2ray-geosite \
    v2ray-plugin \
    geoview
fi

if [ "${INCLUDE_MOSDNS}" = "true" ]; then
  # 仅从 feed 安装必要的依赖组件
  install_packages small_package v2dat geoview

  # 删除所有 feed 中可能造成版本冲突的 mosdns 和 luci 组件
  echo "Cleaning up conflicting mosdns versions..."
  rm -rf feeds/packages/net/mosdns
  rm -rf feeds/luci/applications/luci-app-mosdns
  rm -rf feeds/small_package/mosdns
  rm -rf feeds/small_package/luci-app-mosdns

  # 拉取高度匹配的 sbwml v5 源码，解决 adblock-set 报错
  echo "Cloning sbwml/luci-app-mosdns (v5)..."
  git clone -b v5 https://github.com/sbwml/luci-app-mosdns package/mosdns
fi

if [ "${INCLUDE_HOMEPROXY}" = "true" ]; then
  install_packages small_package luci-app-homeproxy sing-box
fi
