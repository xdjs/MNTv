'use client'

import { useEffect, useState } from "react";

function InstallPrompt() {
     const [isIOS, setIsIOS] = useState(false)

     useEffect(() => {
          setIsIOS(
               /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & typeof globalThis)
          )
     }, 
     [] )

     return (
          <div>
               <h3>Install App</h3>
               <button>Add to Home Screen</button>
               {isIOS && (
                    <p>
                         To install this app on your IOS device tap the share button
                         <span role="img" aria-label="share icon">
                              {' '} ⎋ {' '}
                         </span>
                         and then &quot;Add to Home Screen&quot;
                         <span role="img" aria-label="plus-icon">
                              {' '}➕{' '}
                         </span>
                    </p>
               )}
          </div>
     )
}

export default function Page() {
     return (
     <div>
          <InstallPrompt />
     </div>
     )
}
