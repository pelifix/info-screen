#!/bin/bash
# Raspberry Pi Kiosk Setup for Info Screen
# Tested on: Raspberry Pi 3/4 with Raspberry Pi OS (Bookworm/Bullseye)
# URL: https://pelifix.github.io/info-screen/
#
# Usage:
#   1. Flash Raspberry Pi OS Lite (or Desktop) to SD card
#   2. Enable SSH and WiFi during flashing (via Raspberry Pi Imager)
#   3. SSH into the Pi: ssh pi@raspberrypi.local
#   4. Copy this script: scp kiosk-setup.sh pi@raspberrypi.local:~
#   5. Run: chmod +x kiosk-setup.sh && sudo ./kiosk-setup.sh
#   6. Reboot: sudo reboot
#
# The Pi will boot straight into the info screen in fullscreen.

set -e

KIOSK_URL="https://pelifix.github.io/info-screen/"
KIOSK_USER="christer"

echo "=== Info Screen Kiosk Setup ==="
echo "URL: $KIOSK_URL"
echo ""

# Update system
echo "[1/6] Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# Install minimal X server + Chromium
echo "[2/6] Installing packages..."
apt-get install -y -qq \
    xserver-xorg x11-xserver-utils xinit \
    chromium-browser \
    unclutter \
    lightdm

# Configure autologin
echo "[3/6] Setting up autologin..."
mkdir -p /etc/lightdm/lightdm.conf.d
cat > /etc/lightdm/lightdm.conf.d/autologin.conf << EOF
[Seat:*]
autologin-user=$KIOSK_USER
autologin-user-timeout=0
user-session=kiosk
EOF

# Create kiosk session
echo "[4/6] Creating kiosk session..."
cat > /usr/share/xsessions/kiosk.desktop << EOF
[Desktop Entry]
Name=Kiosk
Exec=/home/$KIOSK_USER/kiosk.sh
Type=Application
EOF

# Create kiosk startup script
cat > /home/$KIOSK_USER/kiosk.sh << 'KIOSKEOF'
#!/bin/bash

# Disable screen blanking and power management
xset s off
xset s noblank
xset -dpms

# Hide cursor after 0.5s of inactivity
unclutter -idle 0.5 -root &

# Wait for network (max 30s)
for i in $(seq 1 30); do
    if ping -c1 -W1 8.8.8.8 &>/dev/null; then break; fi
    sleep 1
done

# Clean up Chromium crash flags (prevents "restore session" dialogs)
CHROMIUM_DIR="$HOME/.config/chromium/Default"
mkdir -p "$CHROMIUM_DIR"
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' "$CHROMIUM_DIR/Preferences" 2>/dev/null || true
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$CHROMIUM_DIR/Preferences" 2>/dev/null || true

# Launch Chromium in kiosk mode
while true; do
    chromium-browser \
        --kiosk \
        --noerrdialogs \
        --disable-infobars \
        --disable-session-crashed-bubble \
        --disable-restore-session-state \
        --disable-features=TranslateUI \
        --disable-pinch \
        --overscroll-history-navigation=0 \
        --check-for-update-interval=31536000 \
        --autoplay-policy=no-user-gesture-required \
        --start-fullscreen \
        --window-position=0,0 \
        "$KIOSK_URL"

    # If Chromium crashes, wait 5s and restart
    sleep 5
done
KIOSKEOF

chmod +x /home/$KIOSK_USER/kiosk.sh
chown $KIOSK_USER:$KIOSK_USER /home/$KIOSK_USER/kiosk.sh

# Disable screen blanking in boot config
echo "[5/6] Disabling screen blanking..."
if ! grep -q "consoleblank=0" /boot/cmdline.txt 2>/dev/null && \
   ! grep -q "consoleblank=0" /boot/firmware/cmdline.txt 2>/dev/null; then
    # Bookworm uses /boot/firmware/, Bullseye uses /boot/
    CMDLINE="/boot/cmdline.txt"
    [ -f /boot/firmware/cmdline.txt ] && CMDLINE="/boot/firmware/cmdline.txt"
    sed -i 's/$/ consoleblank=0/' "$CMDLINE"
fi

# Optional: set GPU memory for smoother rendering (Pi 3/4)
echo "[6/6] Optimizing GPU memory..."
CONFIG="/boot/config.txt"
[ -f /boot/firmware/config.txt ] && CONFIG="/boot/firmware/config.txt"
if ! grep -q "gpu_mem=" "$CONFIG"; then
    echo "gpu_mem=128" >> "$CONFIG"
fi

echo ""
echo "=== Setup complete! ==="
echo "Reboot to start kiosk: sudo reboot"
echo ""
echo "Useful commands:"
echo "  SSH in:          ssh pi@raspberrypi.local"
echo "  Stop kiosk:      sudo systemctl stop lightdm"
echo "  Restart kiosk:   sudo systemctl restart lightdm"
echo "  Change URL:      nano ~/kiosk.sh"
echo "  View logs:       journalctl -u lightdm -f"
