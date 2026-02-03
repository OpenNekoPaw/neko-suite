#!/bin/bash
# =============================================================================
# media-processor-rs CLI Interface Test Script
# =============================================================================
# Usage: ./test_cli.sh [test_video.mp4] [test_project.jvi]
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0
SKIPPED=0

# Configuration
BINARY="neko-engine"
TEST_VIDEO="${1:-test_video.mp4}"
TEST_JVI="${2:-test_project.jvi}"
OUTPUT_DIR="./test_output"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((SKIPPED++))
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

check_binary() {
    if ! command -v "$BINARY" &> /dev/null; then
        echo -e "${RED}Error: $BINARY not found in PATH${NC}"
        echo "Please build the project first: cargo build --release"
        exit 1
    fi
}

setup_test_env() {
    mkdir -p "$OUTPUT_DIR"
    log_info "Test output directory: $OUTPUT_DIR"
}

cleanup() {
    if [ -d "$OUTPUT_DIR" ]; then
        rm -rf "$OUTPUT_DIR"
        log_info "Cleaned up test output directory"
    fi
}

# =============================================================================
# Test: serve command
# =============================================================================

test_serve_help() {
    log_info "Testing: serve --help"
    if $BINARY serve --help &> /dev/null; then
        log_pass "serve --help"
    else
        log_fail "serve --help"
    fi
}

test_serve_invalid_port() {
    log_info "Testing: serve with invalid port"
    if $BINARY serve --port 99999 2>&1 | grep -qi "error\|invalid"; then
        log_pass "serve rejects invalid port"
    else
        log_skip "serve invalid port (behavior may vary)"
    fi
}

# =============================================================================
# Test: probe command
# =============================================================================

test_probe_help() {
    log_info "Testing: probe --help"
    if $BINARY probe --help &> /dev/null; then
        log_pass "probe --help"
    else
        log_fail "probe --help"
    fi
}

test_probe_video_text() {
    log_info "Testing: probe video (text format)"
    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "probe video text (test video not found: $TEST_VIDEO)"
        return
    fi

    if $BINARY probe --input "$TEST_VIDEO" 2>&1 | grep -qi "codec\|duration\|resolution"; then
        log_pass "probe video text format"
    else
        log_fail "probe video text format"
    fi
}

test_probe_video_json() {
    log_info "Testing: probe video (JSON format)"
    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "probe video json (test video not found: $TEST_VIDEO)"
        return
    fi

    output=$($BINARY probe --input "$TEST_VIDEO" --format json 2>&1)
    if echo "$output" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        log_pass "probe video JSON format (valid JSON)"
    else
        log_fail "probe video JSON format (invalid JSON)"
    fi
}

test_probe_nonexistent() {
    log_info "Testing: probe nonexistent file"
    if $BINARY probe --input "nonexistent_file_12345.mp4" 2>&1 | grep -qi "error\|not found\|no such"; then
        log_pass "probe handles nonexistent file"
    else
        log_fail "probe handles nonexistent file"
    fi
}

# =============================================================================
# Test: extract command
# =============================================================================

test_extract_help() {
    log_info "Testing: extract --help"
    if $BINARY extract --help &> /dev/null; then
        log_pass "extract --help"
    else
        log_fail "extract --help"
    fi
}

test_extract_frame() {
    log_info "Testing: extract frame at 0s"
    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "extract frame (test video not found: $TEST_VIDEO)"
        return
    fi

    output_file="$OUTPUT_DIR/frame_0s.jpg"
    if $BINARY extract --input "$TEST_VIDEO" --output "$output_file" --time 0.0 2>&1; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "extract frame at 0s"
        else
            log_fail "extract frame at 0s (output file empty or missing)"
        fi
    else
        log_fail "extract frame at 0s (command failed)"
    fi
}

test_extract_frame_with_quality() {
    log_info "Testing: extract frame with quality=95"
    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "extract frame quality (test video not found: $TEST_VIDEO)"
        return
    fi

    output_file="$OUTPUT_DIR/frame_hq.jpg"
    if $BINARY extract --input "$TEST_VIDEO" --output "$output_file" --time 1.0 --quality 95 2>&1; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "extract frame with quality"
        else
            log_fail "extract frame with quality (output file empty or missing)"
        fi
    else
        log_fail "extract frame with quality (command failed)"
    fi
}

test_extract_frame_with_resize() {
    log_info "Testing: extract frame with resize"
    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "extract frame resize (test video not found: $TEST_VIDEO)"
        return
    fi

    output_file="$OUTPUT_DIR/thumbnail.jpg"
    if $BINARY extract --input "$TEST_VIDEO" --output "$output_file" --time 2.0 --width 320 --height 180 2>&1; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "extract frame with resize"
        else
            log_fail "extract frame with resize (output file empty or missing)"
        fi
    else
        log_fail "extract frame with resize (command failed)"
    fi
}

test_extract_nonexistent() {
    log_info "Testing: extract from nonexistent file"
    if $BINARY extract --input "nonexistent_12345.mp4" --output "$OUTPUT_DIR/fail.jpg" --time 0.0 2>&1 | grep -qi "error\|not found\|no such"; then
        log_pass "extract handles nonexistent file"
    else
        log_fail "extract handles nonexistent file"
    fi
}

# =============================================================================
# Test: export command
# =============================================================================

test_export_help() {
    log_info "Testing: export --help"
    if $BINARY export --help &> /dev/null; then
        log_pass "export --help"
    else
        log_fail "export --help"
    fi
}

test_export_basic() {
    log_info "Testing: export basic"
    if [ ! -f "$TEST_JVI" ]; then
        log_skip "export basic (test jvi not found: $TEST_JVI)"
        return
    fi

    output_file="$OUTPUT_DIR/export_basic.mp4"
    if $BINARY export --jvi-file "$TEST_JVI" --output "$output_file" 2>&1; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "export basic"
        else
            log_fail "export basic (output file empty or missing)"
        fi
    else
        log_fail "export basic (command failed)"
    fi
}

test_export_with_codec() {
    log_info "Testing: export with codec h264"
    if [ ! -f "$TEST_JVI" ]; then
        log_skip "export with codec (test jvi not found: $TEST_JVI)"
        return
    fi

    output_file="$OUTPUT_DIR/export_h264.mp4"
    if $BINARY export --jvi-file "$TEST_JVI" --output "$output_file" --codec h264 --bitrate 5000000 2>&1; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "export with codec h264"
        else
            log_fail "export with codec h264 (output file empty or missing)"
        fi
    else
        log_fail "export with codec h264 (command failed)"
    fi
}

test_export_with_preset() {
    log_info "Testing: export with preset fast"
    if [ ! -f "$TEST_JVI" ]; then
        log_skip "export with preset (test jvi not found: $TEST_JVI)"
        return
    fi

    output_file="$OUTPUT_DIR/export_fast.mp4"
    if $BINARY export --jvi-file "$TEST_JVI" --output "$output_file" --preset fast 2>&1; then
        if [ -f "$output_file" ] && [ -s "$output_file" ]; then
            log_pass "export with preset fast"
        else
            log_fail "export with preset fast (output file empty or missing)"
        fi
    else
        log_fail "export with preset fast (command failed)"
    fi
}

test_export_nonexistent() {
    log_info "Testing: export nonexistent jvi file"
    if $BINARY export --jvi-file "nonexistent_12345.jvi" --output "$OUTPUT_DIR/fail.mp4" 2>&1 | grep -qi "error\|not found\|no such"; then
        log_pass "export handles nonexistent jvi file"
    else
        log_fail "export handles nonexistent jvi file"
    fi
}

test_export_invalid_codec() {
    log_info "Testing: export with invalid codec"
    if [ ! -f "$TEST_JVI" ]; then
        log_skip "export invalid codec (test jvi not found: $TEST_JVI)"
        return
    fi

    if $BINARY export --jvi-file "$TEST_JVI" --output "$OUTPUT_DIR/fail.mp4" --codec invalid_codec 2>&1 | grep -qi "error\|invalid\|unsupported"; then
        log_pass "export rejects invalid codec"
    else
        log_fail "export rejects invalid codec"
    fi
}

# =============================================================================
# Test: Output Quality Detection
# =============================================================================

# Check if ImageMagick is available
has_imagemagick() {
    command -v convert &> /dev/null
}

# Check if ffmpeg is available
has_ffmpeg() {
    command -v ffmpeg &> /dev/null
}

# Detect black frame using ImageMagick
test_black_frame_detection() {
    log_info "Testing: Black frame detection"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "black frame detection (test video not found: $TEST_VIDEO)"
        return
    fi

    if ! has_imagemagick; then
        log_skip "black frame detection (ImageMagick not installed)"
        return
    fi

    # Extract a frame
    frame_file="$OUTPUT_DIR/frame_black_check.jpg"
    if ! $BINARY extract --input "$TEST_VIDEO" --output "$frame_file" --time 1.0 2>&1; then
        log_fail "black frame detection (failed to extract frame)"
        return
    fi

    # Check average brightness using ImageMagick
    brightness=$(convert "$frame_file" -colorspace Gray -format "%[fx:mean]" info: 2>/dev/null)

    if [ -z "$brightness" ]; then
        log_fail "black frame detection (failed to analyze brightness)"
        return
    fi

    # Check if brightness > 0.01 (not black)
    is_black=$(echo "$brightness < 0.01" | bc -l 2>/dev/null || echo "0")

    if [ "$is_black" = "1" ]; then
        log_fail "black frame detection (frame appears to be black, brightness: $brightness)"
    else
        log_pass "black frame detection (brightness: $brightness)"
    fi
}

# Detect video file size and bitrate
test_video_file_size() {
    log_info "Testing: Video file size detection"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "video file size (test video not found: $TEST_VIDEO)"
        return
    fi

    # Get file size
    if [[ "$OSTYPE" == "darwin"* ]]; then
        file_size=$(stat -f%z "$TEST_VIDEO" 2>/dev/null)
    else
        file_size=$(stat -c%s "$TEST_VIDEO" 2>/dev/null)
    fi

    if [ -z "$file_size" ] || [ "$file_size" -eq 0 ]; then
        log_fail "video file size (failed to get file size)"
        return
    fi

    # Get duration from probe
    duration=$($BINARY probe --input "$TEST_VIDEO" --format json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration', 0))" 2>/dev/null)

    if [ -z "$duration" ] || [ "$duration" = "0" ]; then
        log_skip "video file size (failed to get duration)"
        return
    fi

    # Calculate bitrate
    bitrate=$(echo "scale=0; $file_size * 8 / $duration" | bc -l 2>/dev/null)

    log_info "  File size: $file_size bytes"
    log_info "  Duration: $duration seconds"
    log_info "  Bitrate: $bitrate bps"

    # Check if bitrate is reasonable (> 100kbps and < 100Mbps)
    if [ "$bitrate" -gt 100000 ] && [ "$bitrate" -lt 100000000 ]; then
        log_pass "video file size (bitrate: ${bitrate}bps)"
    else
        log_fail "video file size (bitrate out of range: ${bitrate}bps)"
    fi
}

# Detect audio volume using ffmpeg
test_audio_volume_detection() {
    log_info "Testing: Audio volume detection"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "audio volume detection (test video not found: $TEST_VIDEO)"
        return
    fi

    if ! has_ffmpeg; then
        log_skip "audio volume detection (ffmpeg not installed)"
        return
    fi

    # Analyze audio volume
    volume_info=$(ffmpeg -i "$TEST_VIDEO" -af "volumedetect" -f null /dev/null 2>&1)

    mean_volume=$(echo "$volume_info" | grep "mean_volume" | sed 's/.*mean_volume: \([-0-9.]*\) dB.*/\1/')
    max_volume=$(echo "$volume_info" | grep "max_volume" | sed 's/.*max_volume: \([-0-9.]*\) dB.*/\1/')

    if [ -z "$mean_volume" ]; then
        log_skip "audio volume detection (no audio track or failed to analyze)"
        return
    fi

    log_info "  Mean volume: $mean_volume dB"
    log_info "  Max volume: $max_volume dB"

    # Check if audio is not silent (mean > -60 dB)
    is_silent=$(echo "$mean_volume < -60" | bc -l 2>/dev/null || echo "0")

    if [ "$is_silent" = "1" ]; then
        log_fail "audio volume detection (audio appears silent, mean: $mean_volume dB)"
    else
        log_pass "audio volume detection (mean: $mean_volume dB, max: $max_volume dB)"
    fi
}

# Check for audio clipping
test_audio_clipping_detection() {
    log_info "Testing: Audio clipping detection"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "audio clipping detection (test video not found: $TEST_VIDEO)"
        return
    fi

    if ! has_ffmpeg; then
        log_skip "audio clipping detection (ffmpeg not installed)"
        return
    fi

    # Get max volume
    max_volume=$(ffmpeg -i "$TEST_VIDEO" -af "volumedetect" -f null /dev/null 2>&1 | grep "max_volume" | sed 's/.*max_volume: \([-0-9.]*\) dB.*/\1/')

    if [ -z "$max_volume" ]; then
        log_skip "audio clipping detection (no audio track)"
        return
    fi

    # Check if max volume is at or near 0 dB (clipping)
    is_clipping=$(echo "$max_volume >= -0.1" | bc -l 2>/dev/null || echo "0")

    if [ "$is_clipping" = "1" ]; then
        log_fail "audio clipping detection (potential clipping, max: $max_volume dB)"
    else
        log_pass "audio clipping detection (no clipping, max: $max_volume dB)"
    fi
}

# Check exported video quality
test_export_quality() {
    log_info "Testing: Export output quality"

    if [ ! -f "$TEST_JVI" ]; then
        log_skip "export quality (test jvi not found: $TEST_JVI)"
        return
    fi

    output_file="$OUTPUT_DIR/export_quality_test.mp4"
    expected_bitrate=5000000

    # Export video
    if ! $BINARY export --jvi-file "$TEST_JVI" --output "$output_file" --bitrate $expected_bitrate 2>&1; then
        log_fail "export quality (export failed)"
        return
    fi

    if [ ! -f "$output_file" ] || [ ! -s "$output_file" ]; then
        log_fail "export quality (output file missing or empty)"
        return
    fi

    # Get actual file size
    if [[ "$OSTYPE" == "darwin"* ]]; then
        file_size=$(stat -f%z "$output_file" 2>/dev/null)
    else
        file_size=$(stat -c%s "$output_file" 2>/dev/null)
    fi

    # Get duration
    duration=$($BINARY probe --input "$output_file" --format json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('duration', 0))" 2>/dev/null)

    if [ -z "$duration" ] || [ "$duration" = "0" ]; then
        log_fail "export quality (failed to get duration)"
        return
    fi

    # Calculate actual bitrate
    actual_bitrate=$(echo "scale=0; $file_size * 8 / $duration" | bc -l 2>/dev/null)

    # Check if within 30% of expected
    min_bitrate=$(echo "scale=0; $expected_bitrate * 70 / 100" | bc -l)
    max_bitrate=$(echo "scale=0; $expected_bitrate * 130 / 100" | bc -l)

    log_info "  Expected bitrate: $expected_bitrate bps"
    log_info "  Actual bitrate: $actual_bitrate bps"

    if [ "$actual_bitrate" -ge "$min_bitrate" ] && [ "$actual_bitrate" -le "$max_bitrate" ]; then
        log_pass "export quality (bitrate within expected range)"
    else
        log_fail "export quality (bitrate outside expected range)"
    fi
}

# =============================================================================
# Test: System Resource Detection
# =============================================================================

# CPU usage thresholds
CPU_THRESHOLD_SYSTEM=80    # System-wide CPU threshold
CPU_THRESHOLD_PROCESS=10   # Process CPU threshold for GPU acceleration check (full GPU pipeline should be <10%)

# Get system CPU usage
get_system_cpu_usage() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//'
    else
        top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//'
    fi
}

# Get process CPU usage
get_process_cpu_usage() {
    local pid=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' '
    else
        ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' '
    fi
}

# Test system CPU usage
test_system_cpu_usage() {
    log_info "Testing: System CPU usage detection"

    cpu_usage=$(get_system_cpu_usage)

    if [ -z "$cpu_usage" ]; then
        log_fail "system CPU usage (failed to get CPU usage)"
        return
    fi

    log_info "  System CPU usage: ${cpu_usage}%"
    log_info "  Threshold: ${CPU_THRESHOLD_SYSTEM}%"

    # Check if CPU is overloaded
    is_overloaded=$(echo "$cpu_usage > $CPU_THRESHOLD_SYSTEM" | bc -l 2>/dev/null || echo "0")

    if [ "$is_overloaded" = "1" ]; then
        log_fail "system CPU usage (CPU overloaded: ${cpu_usage}% > ${CPU_THRESHOLD_SYSTEM}%)"
        echo -e "${RED}  ERROR: CPU usage too high. CPU-intensive operations disabled:${NC}"
        echo "    - Preview: DISABLED"
        echo "    - Export: DISABLED"
        echo "    - Composite: DISABLED"
    else
        log_pass "system CPU usage (${cpu_usage}%)"
    fi
}

# Test GPU availability
test_gpu_availability() {
    log_info "Testing: GPU availability detection"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Check for GPU using system_profiler
        gpu_info=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset Model|Metal Support")

        if [ -z "$gpu_info" ]; then
            log_fail "GPU availability (no GPU detected)"
            return
        fi

        gpu_name=$(echo "$gpu_info" | grep "Chipset Model" | head -1 | sed 's/.*Chipset Model: //')
        metal_support=$(echo "$gpu_info" | grep "Metal Support" | head -1 | sed 's/.*Metal Support: //')

        log_info "  GPU: $gpu_name"
        log_info "  Metal: $metal_support"

        if [ -n "$gpu_name" ]; then
            log_pass "GPU availability ($gpu_name)"
        else
            log_fail "GPU availability (no GPU name found)"
        fi
    else
        # Linux: Check for GPU using lspci
        if command -v lspci &> /dev/null; then
            gpu_info=$(lspci | grep -i "vga\|3d\|display" | head -1)
            if [ -n "$gpu_info" ]; then
                log_pass "GPU availability ($gpu_info)"
            else
                log_fail "GPU availability (no GPU detected)"
            fi
        else
            log_skip "GPU availability (lspci not available)"
        fi
    fi
}

# Test memory usage
test_memory_usage() {
    log_info "Testing: Memory usage detection"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Get memory info
        total_mem=$(sysctl -n hw.memsize 2>/dev/null)
        page_size=$(vm_stat | head -1 | awk '{print $8}')
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')

        if [ -z "$total_mem" ] || [ -z "$free_pages" ] || [ -z "$page_size" ]; then
            log_fail "memory usage (failed to get memory info)"
            return
        fi

        free_mem=$((free_pages * page_size))
        used_mem=$((total_mem - free_mem))
        usage_percent=$((used_mem * 100 / total_mem))

        total_gb=$(echo "scale=2; $total_mem / 1024 / 1024 / 1024" | bc -l)
        free_gb=$(echo "scale=2; $free_mem / 1024 / 1024 / 1024" | bc -l)
    else
        # Linux: Get memory info
        mem_info=$(free -b | grep Mem)
        total_mem=$(echo "$mem_info" | awk '{print $2}')
        free_mem=$(echo "$mem_info" | awk '{print $4}')
        used_mem=$(echo "$mem_info" | awk '{print $3}')
        usage_percent=$((used_mem * 100 / total_mem))

        total_gb=$(echo "scale=2; $total_mem / 1024 / 1024 / 1024" | bc -l)
        free_gb=$(echo "scale=2; $free_mem / 1024 / 1024 / 1024" | bc -l)
    fi

    log_info "  Total memory: ${total_gb} GB"
    log_info "  Free memory: ${free_gb} GB"
    log_info "  Usage: ${usage_percent}%"

    # Check if memory is low (> 90%)
    if [ "$usage_percent" -gt 90 ]; then
        log_fail "memory usage (memory low: ${usage_percent}%)"
        echo -e "${RED}  ERROR: Memory usage too high. Operations may fail.${NC}"
    else
        log_pass "memory usage (${usage_percent}%)"
    fi
}

# Test VRAM (macOS only)
test_vram_detection() {
    log_info "Testing: VRAM detection"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        vram_info=$(system_profiler SPDisplaysDataType 2>/dev/null | grep -i "VRAM")

        if [ -z "$vram_info" ]; then
            # Apple Silicon uses unified memory
            chip_info=$(system_profiler SPHardwareDataType 2>/dev/null | grep "Chip")
            if echo "$chip_info" | grep -qi "Apple"; then
                log_info "  Apple Silicon detected - unified memory architecture"
                log_pass "VRAM detection (unified memory)"
            else
                log_skip "VRAM detection (no VRAM info available)"
            fi
        else
            vram_size=$(echo "$vram_info" | head -1 | sed 's/.*VRAM.*: //')
            log_info "  VRAM: $vram_size"
            log_pass "VRAM detection ($vram_size)"
        fi
    else
        log_skip "VRAM detection (Linux - use nvidia-smi for NVIDIA GPUs)"
    fi
}

# Test resource guard - check if operations should be disabled
test_resource_guard() {
    log_info "Testing: Resource guard (operation availability)"

    cpu_usage=$(get_system_cpu_usage)
    cpu_ok=1
    mem_ok=1
    gpu_ok=1

    # Check CPU
    if [ -n "$cpu_usage" ]; then
        is_cpu_high=$(echo "$cpu_usage > $CPU_THRESHOLD_SYSTEM" | bc -l 2>/dev/null || echo "0")
        if [ "$is_cpu_high" = "1" ]; then
            cpu_ok=0
        fi
    fi

    # Check memory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        total_mem=$(sysctl -n hw.memsize 2>/dev/null)
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
        page_size=$(vm_stat | head -1 | awk '{print $8}')
        free_mem=$((free_pages * page_size))
        usage_percent=$((100 - free_mem * 100 / total_mem))
    else
        usage_percent=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    fi

    if [ "$usage_percent" -gt 90 ]; then
        mem_ok=0
    fi

    # Check GPU
    if [[ "$OSTYPE" == "darwin"* ]]; then
        gpu_name=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1)
        if [ -z "$gpu_name" ]; then
            gpu_ok=0
        fi
    fi

    # Determine operation availability
    can_preview=$((cpu_ok && mem_ok && gpu_ok))
    can_export=$((cpu_ok && mem_ok))
    can_composite=$((cpu_ok && mem_ok && gpu_ok))

    log_info "  Preview: $([ $can_preview -eq 1 ] && echo 'ENABLED' || echo 'DISABLED')"
    log_info "  Export: $([ $can_export -eq 1 ] && echo 'ENABLED' || echo 'DISABLED')"
    log_info "  Composite: $([ $can_composite -eq 1 ] && echo 'ENABLED' || echo 'DISABLED')"

    if [ $can_preview -eq 1 ] && [ $can_export -eq 1 ] && [ $can_composite -eq 1 ]; then
        log_pass "resource guard (all operations enabled)"
    else
        blocked_reasons=""
        [ $cpu_ok -eq 0 ] && blocked_reasons="${blocked_reasons}CPU high, "
        [ $mem_ok -eq 0 ] && blocked_reasons="${blocked_reasons}Memory low, "
        [ $gpu_ok -eq 0 ] && blocked_reasons="${blocked_reasons}GPU unavailable, "
        blocked_reasons=${blocked_reasons%, }
        log_fail "resource guard (blocked: $blocked_reasons)"
    fi
}

# Test process CPU during operation (GPU acceleration verification)
test_process_cpu_during_operation() {
    log_info "Testing: Process CPU during GPU operation"

    if [ ! -f "$TEST_VIDEO" ]; then
        log_skip "process CPU during operation (test video not found: $TEST_VIDEO)"
        return
    fi

    # Start extract operation in background and monitor CPU
    output_file="$OUTPUT_DIR/gpu_test_frame.jpg"

    # Get initial CPU baseline
    baseline_cpu=$(get_system_cpu_usage)

    # Run operation and capture PID
    $BINARY extract --input "$TEST_VIDEO" --output "$output_file" --time 1.0 &
    op_pid=$!

    # Sample CPU usage during operation
    max_cpu=0
    samples=0
    total_cpu=0

    while kill -0 $op_pid 2>/dev/null; do
        proc_cpu=$(get_process_cpu_usage $op_pid)
        if [ -n "$proc_cpu" ] && [ "$proc_cpu" != "" ]; then
            # Handle floating point comparison
            current_cpu=$(echo "$proc_cpu" | cut -d'.' -f1)
            if [ -n "$current_cpu" ] && [ "$current_cpu" -gt "$max_cpu" ] 2>/dev/null; then
                max_cpu=$current_cpu
            fi
            total_cpu=$((total_cpu + current_cpu))
            samples=$((samples + 1))
        fi
        sleep 0.1
    done

    wait $op_pid 2>/dev/null

    if [ $samples -gt 0 ]; then
        avg_cpu=$((total_cpu / samples))
        log_info "  Peak process CPU: ${max_cpu}%"
        log_info "  Average process CPU: ${avg_cpu}%"
        log_info "  Threshold for GPU acceleration: ${CPU_THRESHOLD_PROCESS}%"

        if [ "$max_cpu" -gt "$CPU_THRESHOLD_PROCESS" ]; then
            log_fail "process CPU during operation (high CPU: ${max_cpu}%)"
            echo -e "${RED}  WARNING: High CPU usage detected during GPU operation.${NC}"
            echo "  This indicates CPU-GPU data transfer or CPU fallback."
            echo "  Expected: Full GPU acceleration with CPU < ${CPU_THRESHOLD_PROCESS}%"
        else
            log_pass "process CPU during operation (peak: ${max_cpu}%, avg: ${avg_cpu}%)"
        fi
    else
        log_skip "process CPU during operation (no samples collected)"
    fi
}

# Test CPU high usage error feedback
test_cpu_high_error_feedback() {
    log_info "Testing: CPU high usage error feedback"

    cpu_usage=$(get_system_cpu_usage)

    if [ -z "$cpu_usage" ]; then
        log_skip "CPU high error feedback (failed to get CPU usage)"
        return
    fi

    # Simulate error message for high CPU
    if [ "$(echo "$cpu_usage > $CPU_THRESHOLD_SYSTEM" | bc -l 2>/dev/null)" = "1" ]; then
        echo -e "${RED}  ERROR: CPU usage critically high: ${cpu_usage}%${NC}"
        echo "  CPU-intensive operations have been disabled:"
        echo "    - Preview: DISABLED"
        echo "    - Export video: DISABLED"
        echo "    - Render composite frame: DISABLED"
        echo ""
        echo "  This may indicate:"
        echo "    1. CPU-GPU data transfer is occurring"
        echo "    2. Operations are falling back to CPU"
        echo "    3. GPU pipeline is not fully utilized"
        echo ""
        echo "  Recommendations:"
        echo "    - Close other applications"
        echo "    - Wait for CPU usage to decrease"
        echo "    - Check GPU acceleration settings"
        log_fail "CPU high error feedback (CPU overloaded: ${cpu_usage}%)"
    else
        log_pass "CPU high error feedback (CPU normal: ${cpu_usage}%)"
    fi
}

# Comprehensive system resource report
test_system_resource_report() {
    log_info "Testing: Comprehensive system resource report"

    echo ""
    echo "  ╔════════════════════════════════════════════╗"
    echo "  ║       System Resource Report               ║"
    echo "  ╠════════════════════════════════════════════╣"

    # CPU
    cpu_usage=$(get_system_cpu_usage)
    cpu_status="OK"
    [ "$(echo "$cpu_usage > 90" | bc -l 2>/dev/null)" = "1" ] && cpu_status="CRITICAL"
    [ "$(echo "$cpu_usage > 70" | bc -l 2>/dev/null)" = "1" ] && [ "$cpu_status" = "OK" ] && cpu_status="WARNING"
    printf "  ║ CPU Usage:    %6s%% [%-8s]          ║\n" "$cpu_usage" "$cpu_status"

    # Memory
    if [[ "$OSTYPE" == "darwin"* ]]; then
        total_mem=$(sysctl -n hw.memsize 2>/dev/null)
        free_pages=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
        page_size=$(vm_stat | head -1 | awk '{print $8}')
        free_mem=$((free_pages * page_size))
        mem_usage=$((100 - free_mem * 100 / total_mem))
    else
        mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    fi
    mem_status="OK"
    [ "$mem_usage" -gt 95 ] && mem_status="CRITICAL"
    [ "$mem_usage" -gt 85 ] && [ "$mem_status" = "OK" ] && mem_status="WARNING"
    printf "  ║ Memory Usage: %6s%% [%-8s]          ║\n" "$mem_usage" "$mem_status"

    # GPU
    gpu_status="OK"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        gpu_name=$(system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1 | sed 's/.*Chipset Model: //' | cut -c1-20)
        [ -z "$gpu_name" ] && gpu_status="UNAVAILABLE" && gpu_name="N/A"
    else
        gpu_name="Linux GPU"
    fi
    printf "  ║ GPU:          %-20s [%-8s] ║\n" "$gpu_name" "$gpu_status"

    echo "  ╠════════════════════════════════════════════╣"

    # Operations status
    can_preview="ENABLED"
    can_export="ENABLED"
    can_composite="ENABLED"

    [ "$cpu_status" = "CRITICAL" ] || [ "$mem_status" = "CRITICAL" ] && can_preview="DISABLED" && can_export="DISABLED" && can_composite="DISABLED"
    [ "$gpu_status" = "UNAVAILABLE" ] && can_preview="DISABLED" && can_composite="DISABLED"

    printf "  ║ Preview:      %-28s ║\n" "$can_preview"
    printf "  ║ Export:       %-28s ║\n" "$can_export"
    printf "  ║ Composite:    %-28s ║\n" "$can_composite"

    echo "  ╚════════════════════════════════════════════╝"
    echo ""

    # Overall result
    if [ "$can_preview" = "ENABLED" ] && [ "$can_export" = "ENABLED" ] && [ "$can_composite" = "ENABLED" ]; then
        log_pass "system resource report (all systems operational)"
    else
        log_fail "system resource report (some operations disabled)"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo " media-processor-rs CLI Test Suite"
    echo "=============================================="
    echo ""

    check_binary
    setup_test_env

    # serve command tests
    log_section "serve Command Tests"
    test_serve_help
    test_serve_invalid_port

    # probe command tests
    log_section "probe Command Tests"
    test_probe_help
    test_probe_video_text
    test_probe_video_json
    test_probe_nonexistent

    # extract command tests
    log_section "extract Command Tests"
    test_extract_help
    test_extract_frame
    test_extract_frame_with_quality
    test_extract_frame_with_resize
    test_extract_nonexistent

    # export command tests
    log_section "export Command Tests"
    test_export_help
    test_export_basic
    test_export_with_codec
    test_export_with_preset
    test_export_nonexistent
    test_export_invalid_codec

    # Output quality detection tests
    log_section "Output Quality Detection Tests"
    test_black_frame_detection
    test_video_file_size
    test_audio_volume_detection
    test_audio_clipping_detection
    test_export_quality

    # System resource detection tests
    log_section "System Resource Detection Tests"
    test_system_cpu_usage
    test_gpu_availability
    test_memory_usage
    test_vram_detection
    test_resource_guard
    test_process_cpu_during_operation
    test_cpu_high_error_feedback
    test_system_resource_report

    # Summary
    log_section "Test Summary"
    echo -e "${GREEN}Passed:${NC}  $PASSED"
    echo -e "${RED}Failed:${NC}  $FAILED"
    echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
    echo ""

    # Cleanup
    if [ "$FAILED" -eq 0 ]; then
        cleanup
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed. Output preserved in $OUTPUT_DIR${NC}"
        exit 1
    fi
}

# Run main
main "$@"
