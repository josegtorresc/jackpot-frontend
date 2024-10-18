import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import '../styles/app.css';
import jackpotSound from '../audios/jackpot-giro.wav';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [jackpotAmounts, setJackpotAmounts] = useState({});
  const [totalWon, setTotalWon] = useState(0);
  const [totalJackpotWon, setTotalJackpotWon] = useState(0);
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginDetails, setLoginDetails] = useState({ idPlayer: '', username: '' });
  const [loginError, setLoginError] = useState('');
  const [betAmount, setBetAmount] = useState(0);
  const audioRef = useRef(null);
  const [jackpotLevels, setJackpotLevels] = useState({});
  const [availableLevels, setAvailableLevels] = useState([]); 

  useEffect(() => {
    fetchActiveJackpots();
    fetchPlayers();
    fetchAvailableLevels();
  }, []);

  const fetchActiveJackpots = async () => {
    try {
      const response = await axios.get(
        'https://jackpot-backend.vercel.app/api/alljackpotscreated',
      );
      const activeJackpots = response.data.filter((jackpot) => jackpot.active);
      const jackpotData = {};
      const jackpotLevelData = {};

      activeJackpots.forEach((jackpot) => {
        jackpotData[jackpot.nombre] = jackpot.amount;
        jackpotLevelData[jackpot.nombre] = jackpot.allowedLevels || [];
      });

      setJackpotAmounts(jackpotData);
      setJackpotLevels(jackpotLevelData);
    } catch (error) {
      console.error('Error al obtener los jackpots activos:', error);
    }
  };

  const fetchPlayers = async () => {
    try {
      const response = await axios.get(
        'https://jackpot-backend.vercel.app/api/players',
      );
      setPlayers(response.data);
    } catch (error) {
      console.error('Error al obtener los jugadores:', error);
    }
  };

  const fetchPlayerBalance = async (idPlayer) => {
    try {
      const response = await axios.get(
        `https://jackpot-backend.vercel.app/api/players/${idPlayer}/balance`,
      );
      setTotalWon(response.data.balance);
    } catch (error) {
      console.error('Error al obtener el balance del jugador:', error);
      setTotalWon(0);
    }
  };

  const fetchAvailableLevels = async () => {
    try {
      const response = await axios.get('https://jackpot-backend.vercel.app/api/levels');
      setAvailableLevels(response.data.map(level => level.nivel)); 
    } catch (error) {
      console.error('Error al obtener los niveles disponibles:', error);
    }
  };

  const handleLoginDetailsChange = (e) => {
    const { name, value } = e.target;
    setLoginDetails({ ...loginDetails, [name]: value });
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const player = players.find(
      (p) =>
        p.idPlayer.trim() === loginDetails.idPlayer.trim() &&
        p.username.trim().toLowerCase() === loginDetails.username.trim().toLowerCase(),
    );
    if (player) {
      setSelectedPlayer(player);
      setShowLoginForm(false);
      setLoginError('');
      await fetchPlayerBalance(player.idPlayer);
    } else {
      setLoginError('Jugador no encontrado. Por favor, verifica los detalles.');
    }
  };

  const playJackpotSound = () => {
    if (audioRef.current) {
      audioRef.current.play();
    }
  };

  const getIPAddress = async () => {
    try {
      const response = await axios.get('https://api.ipify.org?format=json');
      return response.data.ip;
    } catch (error) {
      console.error('Error al obtener la IP:', error);
      return 'IP desconocida';
    }
  };

  const getUserTimeZone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  const logTransaction = async (transactionDetails) => {
    try {
      console.log('Detalles de la transacción:', transactionDetails);
      await axios.post(
        'https://jackpot-backend.vercel.app/api/transactions',
        transactionDetails,
      );
    } catch (error) {
      console.error('Error al registrar la transacción:', error);
    }
  };

  const updatePlayerBalance = async (idPlayer, newBalance) => {
    try {
      await axios.put(
        `https://jackpot-backend.vercel.app/api/players/${idPlayer}/balance`,
        { balance: newBalance },
      );
    } catch (error) {
      console.error('Error al actualizar el balance del jugador:', error);
    }
  };

  const createNewPlayer = async () => {
    const idPlayer = uuidv4().slice(0, 6).toUpperCase();
    const username = `user_${idPlayer}`;

    const randomLevel = availableLevels[Math.floor(Math.random() * availableLevels.length)];

    const newPlayer = {
      idPlayer,
      username,
      nivel: randomLevel,
      status: 'Active',
      balance: 0,
    };

    try {
      await axios.post('https://jackpot-backend.vercel.app/api/players', newPlayer);
      setPlayers([...players, newPlayer]);
      setSelectedPlayer(newPlayer);
    } catch (error) {
      console.error('Error al crear el nuevo jugador:', error);
    }
  };

  const placeBet = async () => {
    if (!selectedPlayer) {
      await createNewPlayer();
    }

    if (betAmount <= 0) {
      alert('Por favor, ingresa un monto de apuesta válido.');
      return;
    }

    const playerLevel = selectedPlayer.nivel;
    const allowedJackpots = Object.entries(jackpotLevels)
      .filter(([jackpotName, levels]) => levels.includes(playerLevel))
      .map(([jackpotName]) => jackpotName);

    if (allowedJackpots.length === 0) {
      alert('Tu nivel no está autorizado para girar ninguno de los jackpots.');
      return;
    }

    const transactionId = uuidv4();
    const timeZone = getUserTimeZone();
    const timestamp = moment().tz(timeZone).format('YYYY-MM-DD HH:mm:ss');
    const ip = await getIPAddress();

    try {
      playJackpotSound();
      const jackpotPromises = allowedJackpots.map((jackpot) =>
        axios.post(
          `https://jackpot-backend.vercel.app/api/spin/${encodeURIComponent(jackpot)}`,
          { amount: betAmount, playerLevel }
        )
      );

      const responses = await Promise.all(jackpotPromises);

      let totalAmountWon = 0;
      const jackpotsWon = {};
      const contributions = {};
      let totalContributions = 0;
      let totalBetPercentage = 0;
      let alertMessage = 'Resumen de la apuesta:\n';

      responses.forEach((response, index) => {
        const jackpotName = allowedJackpots[index];
        const { amountWon, jackpotAmount, inJackpot, individualContribution, totalBetPercentage: jackpotBetPercentage } = response.data;

        totalAmountWon += parseFloat(amountWon);
        jackpotsWon[jackpotName] = amountWon;
        contributions[jackpotName] = individualContribution;
        totalContributions += parseFloat(individualContribution);
        totalBetPercentage += jackpotBetPercentage;

        alertMessage += `Jackpot al que se le sumó un porcentaje de la apuesta: ${jackpotName}\n`;
        alertMessage += `Cantidad de Contribución: $${individualContribution}\n`;
        if (parseFloat(amountWon) > 0) {
          alertMessage += `¡Ganaste $${amountWon} en este jackpot!\n`;
        }

        if (inJackpot) {
          setJackpotAmounts((prevAmounts) => ({
            ...prevAmounts,
            [jackpotName]: jackpotAmount,
          }));
        }
      });

      const remainingAmountForPlayer = betAmount - totalContributions;
      const updatedTotalWon = totalWon + totalAmountWon;
      setTotalWon(updatedTotalWon);
      setTotalJackpotWon((prevTotalJackpotWon) => prevTotalJackpotWon + totalAmountWon);

      const transactionDetails = {
        transactionId,
        timestamp,
        ip,
        totalAmountWon,
        betAmount,
        jackpotsWon,
        contributions,
        remainingAmountForPlayer,
        timeZone,
        playerId: selectedPlayer.idPlayer,
        username: selectedPlayer.username,
        nivel: selectedPlayer.nivel,
        affectedJackpot: allowedJackpots[0],
        totalBetPercentage: totalBetPercentage,
      };

      logTransaction(transactionDetails);

      await updatePlayerBalance(selectedPlayer.idPlayer, updatedTotalWon);

      alertMessage += `\nTotal que se atribuye al casino/maquina: $${remainingAmountForPlayer.toFixed(2)}`;
      alert(alertMessage);

    } catch (error) {
      console.error('Error al realizar la apuesta:', error);
    }
  };

  const handleBetAmountChange = (e) => {
    const value = parseFloat(e.target.value);
    setBetAmount(value > 0 ? value : 0);
  };

  return (
    <>
      <div className="card-tools-jackpot">
        <h1>Jackpot</h1>
        {selectedPlayer ? (
          <p>Jugador actual: {selectedPlayer.username}</p>
        ) : (
          <div>
            <button onClick={() => setShowLoginForm(!showLoginForm)}>
              {showLoginForm ? 'Cerrar formulario de inicio de sesión' : 'Iniciar sesión como jugador'}
            </button>
            {showLoginForm && (
              <form onSubmit={handleLoginSubmit}>
                <input
                  type="text"
                  name="idPlayer"
                  placeholder="ID Player"
                  value={loginDetails.idPlayer}
                  onChange={handleLoginDetailsChange}
                  required
                />
                <input
                  type="text"
                  name="username"
                  placeholder="Username"
                  value={loginDetails.username}
                  onChange={handleLoginDetailsChange}
                  required
                />
                <button type="submit">Iniciar Sesión</button>
                {loginError && <p className="error-message">{loginError}</p>}
              </form>
            )}
          </div>
        )}
        <div>
          <input
            type="number"
            placeholder="Ingresa tu apuesta"
            value={betAmount}
            onChange={handleBetAmountChange}
          />
          <button className="btn-place-bet" onClick={placeBet}>
            Realizar Apuesta
          </button>
        </div>
      </div>
      <audio src={jackpotSound} ref={audioRef} />
    </>
  );
}

export default App;
