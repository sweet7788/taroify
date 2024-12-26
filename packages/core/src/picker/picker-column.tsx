import { View } from "@tarojs/components"
import { ViewProps } from "@tarojs/components/types/View"
import classNames from "classnames"
import * as _ from "lodash"
import * as React from "react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { prefixClassname } from "../styles"
// import { getComputedStyle } from "../utils/dom/computed-style"
import { preventDefault } from "../utils/dom/event"
import { addUnitPx } from "../utils/format/unit"
import { fulfillPromise } from "../utils/promisify"
import { useRendered, useRenderedRef, useToRef } from "../utils/state"
import { useTouch } from "../utils/touch"
import PickerOption from "./picker-option"
import { getPickerOptionKey, PickerColumnInstance, PickerOptionObject, DEFAULT_SIBLING_COUNT, DEFAULT_OPTION_HEIGHT } from "./picker.shared"

// 惯性滑动思路:
// 在手指离开屏幕时，如果和上一次 move 时的间隔小于 `MOMENTUM_LIMIT_TIME` 且 move
// 距离大于 `MOMENTUM_LIMIT_DISTANCE` 时，执行惯性滑动
const MOMENTUM_LIMIT_TIME = 300
const MOMENTUM_LIMIT_DISTANCE = 15
const DEFAULT_DURATION = 200

// async function getElementTranslateY(element: Element) {
//   const style = await getComputedStyle(element, ["transform", "webkitTransform"])
//   const transform = style.transform || style.webkitTransform
//   const translateY = transform.slice(7, transform.length - 1).split(", ")[5]

//   return Number(translateY)
// }

// type PickerColumnDuration = "zero" | "switch" | "momentum"

export interface PickerColumnProps extends Omit<ViewProps, "children"> {
  value: any
  className?: string
  readonly?: boolean
  visibleCount?: number
  optionHeight?: number
  children?: PickerOptionObject[]

  onChange?(option: PickerOptionObject, emitChange?: boolean): void
}

const PickerColumn = forwardRef<PickerColumnInstance, PickerColumnProps>(
  (props: PickerColumnProps, ref) => {
    const {
      value,
      className,
      readonly,
      visibleCount = DEFAULT_SIBLING_COUNT * 2,
      optionHeight = DEFAULT_OPTION_HEIGHT,
      children: childrenProp = [],
      onChange,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      ...restProps
    } = props
    const childrenRef = useToRef(childrenProp)
    const wrapperRef = useRef<HTMLElement>()
    const movingRef = useRef<boolean>()
    const startOffsetRef = useRef<number>(0)
    const moveOffsetRef = useRef<number>(0)
    const momentumOffsetRef = useRef<number>(0)
    const touchStartTimeRef = useRef<number>(0)
    const currentDurationRef = useRef<number>(0)

    const transitionEndTriggerRef = useRef<() => void>()

    const touch = useTouch()
    const activeIndexRef = useRef(-1)
    const [activeOffset, setActiveOffset] = useState<number>(0)
    const activeOffsetRef = useToRef(activeOffset)

    // const [duration, setDuration] = useState<PickerColumnDuration>("zero")

    const baseOffset = useMemo(() => (optionHeight * (+visibleCount - 1)) / 2, [visibleCount, optionHeight])

    const countRef = useRenderedRef(() => _.size(childrenProp))

    const adjustIndex = useCallback(
      (index: number) => {
        index = _.clamp(index, 0, countRef.current)
        for (let i = index; i < countRef.current; i++) {
          if (!childrenRef.current[i].disabled) return i
        }
        for (let i = index - 1; i >= 0; i--) {
          if (!childrenRef.current[i].disabled) return i
        }
        return index
      },
      [countRef, childrenRef],
    )

    const setIndex = useCallback(
      (index: number, emitChange?: boolean) => {
        index = adjustIndex(index) || 0

        const offset = -index * optionHeight
        const trigger = () => {
          if (index !== activeIndexRef.current) {
            activeIndexRef.current = index
            const option = childrenRef.current[index]
            onChange?.(option, emitChange)
          }
        }

        // trigger the change event after transitionend when moving
        if (movingRef.current && offset !== activeOffsetRef.current) {
          transitionEndTriggerRef.current = trigger
        } else {
          trigger()
        }

        setActiveOffset(offset)
        if (movingRef.current) {
          moveOffsetRef.current = offset
        }
      },
      [adjustIndex, activeOffsetRef, childrenRef, onChange, optionHeight],
    )

    const getIndexByValue = useCallback(
      (aValue?: any) => {
        const index = _.findIndex(childrenRef.current, ({ value: iValue }) => iValue === aValue)
        return index === -1 ? 0 : index
      },
      [childrenRef],
    )

    const childrenChanged = useRendered(() =>
      JSON.stringify(_.map(childrenProp, ({ value }) => value)),
    )

    useEffect(
      () => {
        const valueIndex = getIndexByValue(value)
        if (valueIndex !== activeIndexRef.current) {
          setIndex(valueIndex)
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [value, childrenChanged],
    )

    const getIndexByOffset = useCallback(
      (offset: number) => _.clamp(Math.round(-offset / optionHeight), 0, countRef.current - 1),
      [countRef, optionHeight],
    )

    const momentum = useCallback(
      (distance: number, duration: number) => {
        const speed = Math.abs(distance / duration)

        distance = activeOffset + (speed / 0.003) * (distance < 0 ? -1 : 1)
        const index = getIndexByOffset(distance)
        // setDuration("momentum")
        currentDurationRef.current = 1000
        setIndex(index, true)
      },
      [activeOffset, getIndexByOffset, setIndex],
    )

    const stopMomentum = useCallback(() => {
      movingRef.current = false
      // setDuration("zero")
      currentDurationRef.current = 0

      if (transitionEndTriggerRef.current) {
        transitionEndTriggerRef.current?.()
        transitionEndTriggerRef.current = undefined
      }
    }, [])

    const onItemClick = useCallback(
      (index: number) => {
        if (movingRef.current || readonly) {
          return
        }

        transitionEndTriggerRef.current = undefined
        currentDurationRef.current = DEFAULT_DURATION
        // setDuration("switch")
        setIndex(index, true)
      },
      [readonly, setIndex],
    )

    const handleTouchStart = async (event) => {
      if (readonly) {
        return
      }

      touch.start(event)

      if (movingRef.current) {
        const translateY = moveOffsetRef.current
        const offset = Math.min(0, translateY)
        if (movingRef.current) {
          setActiveOffset(offset)
        }
        startOffsetRef.current = offset
      } else {
        startOffsetRef.current = activeOffset
      }

      currentDurationRef.current = 0
      touchStartTimeRef.current = Date.now()
      momentumOffsetRef.current = startOffsetRef.current
      // setDuration("zero")
    }

    const handleTouchMove = (event) => {
      if (readonly) {
        return
      }

      touch.move(event)

      if (touch.isVertical()) {
        movingRef.current = true
        preventDefault(event, true)
      }

      const now = Date.now()
      if (now - touchStartTimeRef.current > MOMENTUM_LIMIT_TIME) {
        touchStartTimeRef.current = now
        momentumOffsetRef.current = activeOffset
      }

      const newOffset = _.clamp(
        startOffsetRef.current + touch.deltaY,
        -(countRef.current * optionHeight),
        optionHeight,
      )
      moveOffsetRef.current = newOffset
      setActiveOffset(
        newOffset,
      )
    }

    const handleTouchEnd = () => {
      if (readonly) {
        return
      }

      const distance = activeOffset - momentumOffsetRef.current
      const duration = Date.now() - touchStartTimeRef.current
      const allowMomentum =
        duration < MOMENTUM_LIMIT_TIME && Math.abs(distance) > MOMENTUM_LIMIT_DISTANCE
      if (allowMomentum) {
        momentum(distance, duration)
        return
      }

      const index = getIndexByOffset(activeOffset)
      currentDurationRef.current = DEFAULT_DURATION
      // setDuration("switch")
      setIndex(index, true)

      // compatible with desktop scenario
      // use setTimeout to skip the click event Emitted after touchstart
      setTimeout(() => {
        movingRef.current = false
      }, 0)
    }

    const wrapperStyle = useMemo(
      () => ({
        transform: `translate3d(0, ${addUnitPx(activeOffset + baseOffset)}, 0)`,
        transitionDuration: `${currentDurationRef.current}ms`,
        transitionProperty: currentDurationRef.current ? "all" : "none",
      }),
      [activeOffset, baseOffset],
    )

    useImperativeHandle(
      ref,
      () => ({
        stopMomentum,
      }),
      [stopMomentum],
    )

    return (
      <View
        className={classNames(prefixClassname("picker-column"), className)}
        catchMove
        onTouchStart={(event) => {
          fulfillPromise(handleTouchStart(event))
          onTouchStart?.(event)
        }}
        onTouchMove={(event) => {
          handleTouchMove(event)
          onTouchMove?.(event)
        }}
        onTouchEnd={(event) => {
          handleTouchEnd()
          onTouchEnd?.(event)
        }}
        onTouchCancel={(event) => {
          handleTouchEnd()
          onTouchCancel?.(event)
        }}
        {..._.omit(restProps, "label")}
      >
        <View
          ref={wrapperRef}
          style={wrapperStyle}
          className={classNames(prefixClassname("picker-column__wrapper"), {
            // [prefixClassname("picker-column__wrapper--zero")]: duration === "zero",
            // [prefixClassname("picker-column__wrapper--momentum")]: duration === "momentum",
            // [prefixClassname("picker-column__wrapper--switch")]: duration === "switch",
          })}
          onTransitionEnd={stopMomentum}
        >
          {
            //
            _.map(childrenProp, (option, index) => (
              <PickerOption
                key={getPickerOptionKey(option) ?? index}
                {...option}
                onClick={() => onItemClick(index)}
              />
            ))
          }
        </View>
      </View>
    )
  },
)

export default PickerColumn
