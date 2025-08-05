"use client"

interface PreferenceButtonProps {
     image: string;
     text: string;
     isSelected: boolean;
     onClick: () => void;
}

export default function PreferenceButtons({image, text, isSelected, onClick}: PreferenceButtonProps) {
     return (
          <button
               onClick={onClick} 
               className={`
                    rounded-lg m-2 transition-all z-30
                    ${isSelected ? 'border-white-500 border-md' : 'border-white-500 border-xs'}
              `}
          >
               <img src={image} alt={text} className="z-10">
                    <h3 className="font-semibold text-gray-300 justify-center z-20 ">{text}</h3>
               </img>
          </button>
     );
}