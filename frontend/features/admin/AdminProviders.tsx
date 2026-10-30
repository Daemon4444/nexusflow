"use client";

import { App, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { StyleProvider } from "@ant-design/cssinjs";
import { useTheme } from "@/lib/theme";

export default function AdminProviders({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          cssVar: { prefix: "nf-admin" },
          token: {
            colorPrimary: dark ? "#5b9bff" : "#2f72e0",
            colorInfo: dark ? "#8dbaff" : "#3c83f6",
            colorSuccess: dark ? "#34d399" : "#15803d",
            colorWarning: dark ? "#fbbf24" : "#b45309",
            colorError: dark ? "#fb7185" : "#be123c",
            borderRadius: 8,
            borderRadiusLG: 10,
            fontFamily: "var(--font-sans)",
            fontFamilyCode: "var(--font-mono)",
            controlHeight: 36,
            controlHeightSM: 30,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
          },
          components: {
            Layout: {
              bodyBg: dark ? "#0c1014" : "#fafafb",
              headerBg: dark ? "#11171d" : "#ffffff",
              siderBg: dark ? "#11171d" : "#ffffff",
            },
            Menu: {
              itemBorderRadius: 7,
              itemHeight: 36,
              itemMarginInline: 8,
              itemSelectedBg: dark ? "rgba(60, 131, 246, 0.14)" : "#f3f8ff",
              itemSelectedColor: dark ? "#8dbaff" : "#2f72e0",
            },
            Card: {
              headerHeight: 48,
            },
            Table: {
              headerBg: dark ? "#151c23" : "#f7f9fa",
              headerColor: dark ? "#9ca3af" : "#52606d",
              rowHoverBg: dark ? "#151c23" : "#f3f8ff",
            },
          },
        }}
      >
        <App>{children}</App>
      </ConfigProvider>
    </StyleProvider>
  );
}
