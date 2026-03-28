# ==================== 构建阶段 ====================
FROM rust:1.82-bookworm AS builder

# 安装 FFmpeg 开发库 + Vulkan 开发库 + 构建工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libavcodec-dev \
    libavformat-dev \
    libavfilter-dev \
    libavutil-dev \
    libavdevice-dev \
    libswscale-dev \
    libswresample-dev \
    libvulkan-dev \
    vulkan-validationlayers-dev \
    libclang-dev \
    clang \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 workspace 配置（利用 Docker 缓存层）
COPY Cargo.toml Cargo.lock ./

# 复制所有 crate（workspace 需要全部存在）
COPY packages/types/           ./packages/types/
COPY packages/native-core/     ./packages/native-core/
COPY packages/native-api/      ./packages/native-api/
COPY packages/native-http/     ./packages/native-http/
COPY packages/native-cli/      ./packages/native-cli/
COPY packages/native-scene/    ./packages/native-scene/
COPY packages/native-puppet/   ./packages/native-puppet/
# native-napi 不参与 CLI 构建，跳过
# COPY packages/native-napi/   ./packages/native-napi/

# 构建 CLI binary（跳过 native-napi，避免 napi-rs 依赖）
RUN cargo build --release --bin neko-engine -p neko-native-cli

# ==================== 运行阶段 ====================
FROM debian:bookworm-slim AS runner

# 安装 FFmpeg 运行时 + Vulkan 运行时 + Mesa 软件渲染器（GPU fallback）
RUN apt-get update && apt-get install -y --no-install-recommends \
    # FFmpeg 运行时库
    libavcodec60 \
    libavformat60 \
    libavfilter9 \
    libavutil58 \
    libswscale7 \
    libswresample4 \
    # Vulkan loader（wgpu 需要）
    libvulkan1 \
    # Mesa llvmpipe — 无 GPU 时的 CPU 软件渲染器
    mesa-vulkan-drivers \
    # VAAPI（Linux 硬件编码，有 GPU 时使用）
    libva-drm2 \
    libva2 \
    # 基础工具
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制编译产物
COPY --from=builder /app/target/release/neko-engine ./neko-engine

# 非 root 用户运行
RUN useradd -r -s /bin/false neko
USER neko

EXPOSE 8765

ENV RUST_LOG=info

# 默认以服务模式启动
CMD ["./neko-engine", "serve", "--port", "8765"]
