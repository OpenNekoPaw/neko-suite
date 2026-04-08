# ==================== 阶段1：下载预构建 FFmpeg 7.x ==================
FROM debian:bookworm-slim AS ffmpeg-dl

RUN sed -i 's|http://deb.debian.org|http://mirrors.tuna.tsinghua.edu.cn|g' \
        /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    wget xz-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 下载 BtbN FFmpeg 7.1 预构建共享库（含头文件），用于编译
# https://github.com/BtbN/FFmpeg-Builds/releases
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then PLATFORM="linuxarm64"; else PLATFORM="linux64"; fi && \
    wget -q "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n7.1-latest-${PLATFORM}-gpl-shared-7.1.tar.xz" \
         -O /tmp/ffmpeg.tar.xz && \
    mkdir -p /opt/ffmpeg && \
    tar -xJf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1 && \
    rm /tmp/ffmpeg.tar.xz

# ==================== 阶段2：Rust 构建 ====================
FROM rust:1.85-bookworm AS builder

# 安装构建工具（不需要系统 FFmpeg）
RUN sed -i 's|http://deb.debian.org|http://mirrors.tuna.tsinghua.edu.cn|g' \
        /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libvulkan-dev \
    vulkan-validationlayers-dev \
    libclang-dev \
    clang \
    libasound2-dev \
    libudev-dev \
    libxkbcommon-dev \
    libwayland-dev \
    libx11-dev \
    libxrandr-dev \
    libxi-dev \
    libxcursor-dev \
    libxfixes-dev \
    libssl-dev \
    libva-dev \
    mold \
    && rm -rf /var/lib/apt/lists/*

# 从 ffmpeg-dl 阶段复制预构建的 FFmpeg 头文件和库
COPY --from=ffmpeg-dl /opt/ffmpeg /opt/ffmpeg

# 设置 FFmpeg 路径（ffmpeg-sys-next 使用 FFMPEG_DIR 发现头文件和库）
ENV FFMPEG_DIR=/opt/ffmpeg
ENV PKG_CONFIG_PATH=/opt/ffmpeg/lib/pkgconfig
ENV LD_LIBRARY_PATH=/opt/ffmpeg/lib

WORKDIR /app

# 复制 workspace 配置 + vendor（离线构建）
COPY Cargo.toml Cargo.lock ./
COPY .cargo/ ./.cargo/
COPY vendor/ ./vendor/

# 复制所有 crate
COPY packages/engine-types/    ./packages/engine-types/
COPY packages/engine-kernel/   ./packages/engine-kernel/
COPY packages/host-api/        ./packages/host-api/
COPY packages/host-http/       ./packages/host-http/
COPY packages/host-cli/        ./packages/host-cli/
COPY packages/host-napi/       ./packages/host-napi/
COPY packages/runtime-scene/   ./packages/runtime-scene/
COPY packages/runtime-puppet/  ./packages/runtime-puppet/
COPY packages/runtime-device/  ./packages/runtime-device/
COPY packages/runtime-ml/      ./packages/runtime-ml/
COPY packages/runtime-media/   ./packages/runtime-media/

# 构建 CLI binary（离线，使用 vendor + 预构建 FFmpeg）
# - mold 链接器：内存占用极低
# - strip symbols：减少链接内存峰值
# - CARGO_PROFILE_RELEASE_LTO=thin：覆盖 Cargo.toml 的 lto=true（fat LTO 极耗内存），
#   thin LTO 仍能跨 crate 优化，但内存占用降低约 70%
RUN RUSTFLAGS="-C linker=clang -C link-arg=-fuse-ld=mold -C strip=symbols" \
    CARGO_PROFILE_RELEASE_LTO=thin \
    cargo build --release --offline --frozen --bin neko-engine -p neko-host-cli

# ==================== 阶段3：运行阶段 ====================
FROM debian:bookworm-slim AS runner

# 安装 Vulkan + Mesa 软件渲染器 + VAAPI + 基础工具
RUN sed -i 's|http://deb.debian.org|http://mirrors.tuna.tsinghua.edu.cn|g' \
        /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libvulkan1 \
    mesa-vulkan-drivers \
    libva-drm2 \
    libva2 \
    libasound2 \
    libudev1 \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制预构建的 FFmpeg 运行时库（比系统包版本新）
COPY --from=ffmpeg-dl /opt/ffmpeg/lib/*.so* /usr/local/lib/
RUN ldconfig

WORKDIR /app

# 复制编译产物
COPY --from=builder /app/target/release/neko-engine ./neko-engine

# 非 root 用户运行
RUN useradd -r -s /bin/false neko
USER neko

EXPOSE 8765

ENV RUST_LOG=info

CMD ["./neko-engine", "serve", "--port", "8765"]
