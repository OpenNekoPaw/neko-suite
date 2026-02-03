import { useEffect, useRef, useCallback, useState, useMemo, memo } from 'react';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
  submenu?: MenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

// Helper function to get computed CSS variable value
function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value;
}

// Check if a color is too close to white (for menu background in light theme)
function isCloseToWhite(color: string): boolean {
  if (!color) return false;
  // Check common white values
  const whiteColors = ['#ffffff', '#fff', 'white', 'rgb(255, 255, 255)', 'rgba(255, 255, 255, 1)'];
  return whiteColors.includes(color.toLowerCase());
}

// Hook to get VSCode theme colors
function useVSCodeTheme() {
  const [theme, setTheme] = useState(() => {
    // Check if we're in a dark theme by looking at body classes
    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');
    return { isDark };
  });

  useEffect(() => {
    // Observe body class changes for theme switches
    const observer = new MutationObserver(() => {
      const isDark = document.body.classList.contains('vscode-dark') ||
                     document.body.classList.contains('vscode-high-contrast');
      setTheme({ isDark });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return useMemo(() => {
    const isDark = theme.isDark;

    // VSCode native menu colors (from VSCode source code)
    // Light theme: background #f3f3f3 (light gray), Dark theme: background #252526
    // These match VSCode's native context menu appearance
    const lightMenuBg = '#f3f3f3';
    const darkMenuBg = '#252526';

    // Get menu background, but avoid pure white in light theme
    let menuBg = getCssVar('--vscode-menu-background');
    if (!menuBg || (!isDark && isCloseToWhite(menuBg))) {
      menuBg = isDark ? darkMenuBg : lightMenuBg;
    }

    const menuFg = getCssVar('--vscode-menu-foreground') ||
                   getCssVar('--vscode-foreground') ||
                   (isDark ? '#cccccc' : '#616161');

    const menuBorder = getCssVar('--vscode-menu-border') ||
                       getCssVar('--vscode-widget-border') ||
                       (isDark ? '#454545' : '#c8c8c8');

    const menuSeparator = getCssVar('--vscode-menu-separatorBackground') ||
                          (isDark ? '#454545' : '#d4d4d4');

    const selectionBg = getCssVar('--vscode-menu-selectionBackground') ||
                        getCssVar('--vscode-list-activeSelectionBackground') ||
                        (isDark ? '#04395e' : '#0060c0');

    const selectionFg = getCssVar('--vscode-menu-selectionForeground') ||
                        getCssVar('--vscode-list-activeSelectionForeground') ||
                        '#ffffff';

    const descriptionFg = getCssVar('--vscode-descriptionForeground') ||
                          (isDark ? '#9d9d9d' : '#717171');

    const errorFg = getCssVar('--vscode-errorForeground') ||
                    (isDark ? '#f14c4c' : '#e51400');

    return {
      isDark,
      menuBg,
      menuFg,
      menuBorder,
      menuSeparator,
      selectionBg,
      selectionFg,
      descriptionFg,
      errorFg,
    };
  }, [theme.isDark]);
}

export const ContextMenu = memo(function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x, y });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ x: number; y: number } | null>(null);
  const colors = useVSCodeTheme();

  // Close handler - memoized to avoid re-registering listeners
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Close on any click outside
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    // Close on right-click anywhere (including inside)
    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Right-click outside - close immediately
        handleClose();
      }
    };

    // Close on escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // Close on scroll
    const handleScroll = () => {
      handleClose();
    };

    // Close on window blur
    const handleBlur = () => {
      handleClose();
    };

    // Add listeners with capture phase for faster response
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleClose]);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 4;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 4;
      }

      positionRef.current = { x: adjustedX, y: adjustedY };
      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [x, y]);

  const menuStyle: React.CSSProperties = {
    left: x,
    top: y,
    backgroundColor: colors.menuBg,
    border: `1px solid ${colors.menuBorder}`,
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.16)',
    color: colors.menuFg,
    fontFamily: 'var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif)',
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] py-1 text-[13px] select-none"
      style={menuStyle}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return (
            <div
              key={index}
              style={{
                height: '1px',
                backgroundColor: colors.menuSeparator,
                margin: '4px 0',
              }}
            />
          );
        }

        const isHovered = hoveredIndex === index;
        const hasSubmenu = item.submenu && item.submenu.length > 0;

        return (
          <div
            key={index}
            className="relative"
            onMouseEnter={(e) => {
              if (!item.disabled) {
                setHoveredIndex(index);
                if (hasSubmenu) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSubmenuPosition({
                    x: rect.right - 2,
                    y: rect.top,
                  });
                }
              }
            }}
            onMouseLeave={() => {
              if (!hasSubmenu) {
                setHoveredIndex(null);
              }
            }}
          >
            <button
              onClick={() => {
                if (!item.disabled && !hasSubmenu) {
                  item.onClick();
                  handleClose();
                }
              }}
              disabled={item.disabled}
              className="w-full text-left flex items-center"
              style={{
                padding: '0 12px 0 4px',
                minHeight: '26px',
                lineHeight: '26px',
                cursor: item.disabled ? 'default' : 'pointer',
                opacity: item.disabled ? 0.5 : 1,
                color: item.danger
                  ? colors.errorFg
                  : isHovered
                  ? colors.selectionFg
                  : 'inherit',
                backgroundColor: isHovered && !item.disabled
                  ? colors.selectionBg
                  : 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                borderRadius: '2px',
                margin: '0 4px',
                width: 'calc(100% - 8px)',
              }}
            >
              {/* Icon/checkbox area - 28px to match VSCode native menu */}
              <span style={{
                width: '28px',
                minWidth: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && (
                <span style={{
                  marginLeft: '24px',
                  fontSize: '12px',
                  opacity: 0.6,
                  color: colors.descriptionFg,
                  whiteSpace: 'nowrap',
                }}>
                  {item.shortcut}
                </span>
              )}
              {hasSubmenu && (
                <span style={{ marginLeft: '16px', fontSize: '9px', opacity: 0.6 }}>▶</span>
              )}
            </button>

            {/* Submenu */}
            {hasSubmenu && isHovered && submenuPosition && (
              <div
                className="fixed z-[10000] min-w-[180px] py-1 text-[13px] select-none"
                style={{
                  left: submenuPosition.x,
                  top: submenuPosition.y,
                  backgroundColor: colors.menuBg,
                  border: `1px solid ${colors.menuBorder}`,
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.16)',
                  color: colors.menuFg,
                  fontFamily: 'var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif)',
                }}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {item.submenu!.map((subItem, subIndex) => {
                  if (subItem.separator) {
                    return (
                      <div
                        key={subIndex}
                        style={{
                          height: '1px',
                          backgroundColor: colors.menuSeparator,
                          margin: '4px 0',
                        }}
                      />
                    );
                  }

                  return (
                    <SubMenuItem
                      key={subIndex}
                      item={subItem}
                      onClose={handleClose}
                      colors={colors}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

// SubMenuItem component for cleaner code
interface SubMenuItemProps {
  item: MenuItem;
  onClose: () => void;
  colors: ReturnType<typeof useVSCodeTheme>;
}

function SubMenuItem({ item, onClose, colors }: SubMenuItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={() => {
        if (!item.disabled) {
          item.onClick();
          onClose();
        }
      }}
      disabled={item.disabled}
      className="w-full text-left flex items-center"
      style={{
        padding: '0 12px 0 4px',
        minHeight: '26px',
        lineHeight: '26px',
        cursor: item.disabled ? 'default' : 'pointer',
        opacity: item.disabled ? 0.5 : 1,
        color: item.danger
          ? colors.errorFg
          : isHovered
          ? colors.selectionFg
          : 'inherit',
        backgroundColor: isHovered && !item.disabled
          ? colors.selectionBg
          : 'transparent',
        border: 'none',
        outline: 'none',
        fontSize: '13px',
        borderRadius: '2px',
        margin: '0 4px',
        width: 'calc(100% - 8px)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{
        width: '28px',
        minWidth: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        {item.icon}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.shortcut && (
        <span style={{
          marginLeft: '24px',
          fontSize: '12px',
          opacity: 0.6,
          color: colors.descriptionFg,
          whiteSpace: 'nowrap',
        }}>
          {item.shortcut}
        </span>
      )}
    </button>
  );
}
