import { View } from "@tarojs/components"
import classNames from "classnames"
import * as React from "react"
import { ReactNode, useContext } from "react"
import { prefixClassname } from "../styles"
import TabsLine from "./tabs-line"
import TabsContext from "./tabs.context"
import { TabKey, TabsTheme } from "./tabs.shared"

interface TabProps {
  __dataKey__?: TabKey
  __dataIndex__?: number
  disabled?: boolean
  ellipsis?: boolean
  flexBasis?: string
  children?: ReactNode
}

export default function Tab(props: TabProps) {
  const { __dataIndex__, __dataKey__, disabled, ellipsis, flexBasis, children } = props
  const { activeKey, theme, onTabClick } = useContext(TabsContext)
  const active = __dataKey__ === activeKey
  const themeLine = theme === TabsTheme.Line

  return (
    <View
      style={{ flexBasis }}
      className={classNames(prefixClassname("tabs__tab"), {
        [prefixClassname("tabs__tab--active")]: active,
        [prefixClassname("tabs__tab--disabled")]: disabled,
      })}
      onClick={() =>
        onTabClick?.({
          key: __dataKey__,
          index: __dataIndex__,
          title: children,
          disabled,
        })
      }
    >
      <View
        className={classNames(prefixClassname("tabs__tab__content"), {
          [prefixClassname("ellipsis")]: ellipsis,
        })}
        children={children}
      />
      {themeLine && <TabsLine active={active} />}
    </View>
  )
}
