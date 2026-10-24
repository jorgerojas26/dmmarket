import { createContext, useState } from 'react';

// Crea el contexto con un valor inicial
export const ShowNoeContext = createContext({
    showNoe: false,
    setShowNoe: () => {},
});

export const ShowNoesProvider = ({ children }) => {
    const [showNoe, setShowNoe] = useState(false);

    return <ShowNoeContext.Provider value={{ showNoe, setShowNoe }}>{children}</ShowNoeContext.Provider>;
};
