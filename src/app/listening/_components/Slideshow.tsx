"use client"

import { useState, useEffect } from "react"
import { setInterval } from "timers/promises"
import { SLIDE_TYPES } from "./slideTypes";


// Renders the current slide component
// Handles transitions/animations




export default function Slideshow({ preferences, currentSong }) {
     //const { currentSlide, slideData, nextSlide } = useSlideManager(preferences, currentSong);
     const [currentSlide, setCurrentSlide] = useState(0);
     const slides = SLIDE_TYPES;

     useEffect(() => {
          const timer = setInterval(() => {
               setCurrentSlide(prev )
          })
     })

   }