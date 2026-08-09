#Respaldo Automatico de la base bdsolser_md_nieto
#Fecha: 30/07/2026

SET FOREIGN_KEY_CHECKS=0;

DROP DATABASE IF EXISTS `bdsolser_md_nieto`;

CREATE DATABASE `bdsolser_md_nieto` CHARACTER SET 'latin1' COLLATE 'latin1_swedish_ci';

Use `bdsolser_md_nieto`;


#
# Estructura de la tabla `bancos`
#

DROP TABLE IF EXISTS `bancos`;

CREATE TABLE `bancos` (
  `Id_Banco` varchar(10) NOT NULL,
  `Nombre` varchar(50) default NULL,
  PRIMARY KEY  (`Id_Banco`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `benef`
#

DROP TABLE IF EXISTS `benef`;

CREATE TABLE `benef` (
  `IdBenef` varchar(8) default NULL,
  `Nombre` varchar(50) default NULL,
  `Rif_Ci` varchar(20) default NULL,
  `Status` char(1) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `caja_moves`
#

DROP TABLE IF EXISTS `caja_moves`;

CREATE TABLE `caja_moves` (
  `Fecha` date default NULL,
  `Aux` varchar(3) default NULL,
  `Tipo` varchar(2) default NULL,
  `Numero` varchar(20) default NULL,
  `FormPago` varchar(2) default NULL,
  `NoDoc` varchar(20) default NULL,
  `Referencia` varchar(30) default NULL,
  `Importe` double(15,3) default NULL,
  `Clave` varchar(20) default NULL,
  `Cierre` tinyint(1) default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cajas`
#

DROP TABLE IF EXISTS `cajas`;

CREATE TABLE `cajas` (
  `IdCaja` varchar(20) NOT NULL,
  `Nombre` varchar(30) default NULL,
  `Abierta` tinyint(1) default '0',
  `SaldoIni` double(15,3) default '0.000',
  `NomUsuario` varchar(100) default NULL,
  `Fecha` date default '0000-00-00',
  `SerialIF` varchar(30) default NULL,
  `NumZ` varchar(4) default NULL,
  `Ocupada` tinyint(1) default '0',
  PRIMARY KEY  (`IdCaja`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `centrocostos`
#

DROP TABLE IF EXISTS `centrocostos`;

CREATE TABLE `centrocostos` (
  `IdCentro` varchar(10) NOT NULL,
  `Descripcion` varchar(150) default NULL,
  `Tipo` varchar(50) default NULL,
  PRIMARY KEY  (`IdCentro`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cierrecajas`
#

DROP TABLE IF EXISTS `cierrecajas`;

CREATE TABLE `cierrecajas` (
  `IdCaja` varchar(20) NOT NULL,
  `Nombre` varchar(30) default NULL,
  `NomUsuario` varchar(100) default NULL,
  `SaldoIni` double(15,3) default '0.000',
  `FechaApertura` date default '0000-00-00',
  `FechaCierre` date default '0000-00-00',
  `SerialIF` varchar(254) default NULL,
  `NumZ` varchar(4) default NULL,
  `CierreCaja` longtext,
  `ReporteZ` longtext
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `clientes`
#

DROP TABLE IF EXISTS `clientes`;

CREATE TABLE `clientes` (
  `IdCliente` varchar(15) NOT NULL,
  `Empresa` varchar(60) default NULL,
  `Rif` varchar(20) default NULL,
  `Nit` varchar(20) default NULL,
  `Ci` varchar(20) default NULL,
  `Contacto` varchar(60) default NULL,
  `Direccion` varchar(250) default NULL,
  `Telfs` varchar(50) default NULL,
  `Email` varchar(50) default NULL,
  `Observacion` varchar(250) default NULL,
  `Status` char(1) default NULL,
  `Contribuyente` tinyint(1) default '0',
  `Grupo` varchar(4) default NULL,
  `Ruta` char(3) default 'G',
  `Clave` varchar(50) default NULL,
  PRIMARY KEY  (`IdCliente`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `conceptocostos`
#

DROP TABLE IF EXISTS `conceptocostos`;

CREATE TABLE `conceptocostos` (
  `IdConcepto` varchar(10) NOT NULL,
  `Descripcion` varchar(50) default NULL,
  `IdCentro` varchar(10) NOT NULL,
  `Tipo` varchar(50) default NULL,
  PRIMARY KEY  (`IdConcepto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `configuracion`
#

DROP TABLE IF EXISTS `configuracion`;

CREATE TABLE `configuracion` (
  `EnbFacOpen` tinyint(1) default NULL,
  `EnbConfImp` tinyint(1) default NULL,
  `CodContado` varchar(8) default NULL,
  `RutaImg` varchar(250) default NULL,
  `MostrarImg` tinyint(1) default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `control`
#

DROP TABLE IF EXISTS `control`;

CREATE TABLE `control` (
  `Clave` varchar(10) default NULL,
  `Usuario` varchar(50) default NULL,
  `Nombre` varchar(100) default NULL,
  `Nivel` varchar(5) default NULL,
  `Fecha` date default NULL,
  `Directiva` varchar(5) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `correlativos`
#

DROP TABLE IF EXISTS `correlativos`;

CREATE TABLE `correlativos` (
  `TIPO_DOC` char(3) default NULL,
  `CORRELATIVO` varchar(20) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `ctasbancarias`
#

DROP TABLE IF EXISTS `ctasbancarias`;

CREATE TABLE `ctasbancarias` (
  `Id_Cta` varchar(10) default NULL,
  `Banco` varchar(50) default NULL,
  `No_Cuenta` varchar(23) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cxc_cruces`
#

DROP TABLE IF EXISTS `cxc_cruces`;

CREATE TABLE `cxc_cruces` (
  `IdCruce` int(11) NOT NULL auto_increment,
  `IdMovimiento` int(11) NOT NULL,
  `IdDocumento` int(11) NOT NULL,
  `MontoAplicado` decimal(18,4) NOT NULL,
  `FechaCruce` timestamp NOT NULL default CURRENT_TIMESTAMP,
  PRIMARY KEY  (`IdCruce`),
  KEY `idx_movimiento` (`IdMovimiento`),
  KEY `idx_documento` (`IdDocumento`),
  CONSTRAINT `fk_doc` FOREIGN KEY (`IdDocumento`) REFERENCES `cxc_documentos` (`IdDocumento`),
  CONSTRAINT `fk_mov` FOREIGN KEY (`IdMovimiento`) REFERENCES `cxc_movimientos` (`IdMov`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cxc_documentos`
#

DROP TABLE IF EXISTS `cxc_documentos`;

CREATE TABLE `cxc_documentos` (
  `IdDocumento` int(11) NOT NULL auto_increment,
  `IdFactura` varchar(20) NOT NULL,
  `TipoDoc` enum('FAC','NDB','NCR','RET') default 'FAC',
  `IdCliente` varchar(15) NOT NULL,
  `FechaEmision` date NOT NULL,
  `FechaVencimiento` date default NULL,
  `MonedaOriginal` char(3) default 'USD',
  `MontoOriginal` decimal(18,4) NOT NULL,
  `SaldoActual` decimal(18,4) NOT NULL,
  `Estatus` enum('PENDIENTE','PARCIAL','PAGADO','ANULADO') default 'PENDIENTE',
  `Observacion` varchar(250) default NULL,
  PRIMARY KEY  (`IdDocumento`),
  KEY `idx_cliente_doc` (`IdCliente`),
  KEY `idx_factura` (`IdFactura`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cxc_movimientos`
#

DROP TABLE IF EXISTS `cxc_movimientos`;

CREATE TABLE `cxc_movimientos` (
  `IdMov` int(11) NOT NULL auto_increment,
  `Fecha` datetime NOT NULL,
  `IdCliente` varchar(15) NOT NULL,
  `MonedaPago` char(3) NOT NULL,
  `TasaCambio` decimal(18,6) NOT NULL,
  `MontoPago` decimal(18,4) NOT NULL,
  `MontoBase` decimal(18,4) NOT NULL,
  `FormaPago` varchar(50) default 'TRANSFERENCIA',
  `Referencia` varchar(50) default NULL,
  `Banco` varchar(50) default NULL,
  `Observaciones` text,
  PRIMARY KEY  (`IdMov`),
  KEY `idx_cliente_mov` (`IdCliente`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cxc_retenciones`
#

DROP TABLE IF EXISTS `cxc_retenciones`;

CREATE TABLE `cxc_retenciones` (
  `IdRetencion` int(11) NOT NULL auto_increment,
  `IdMovimiento` int(11) NOT NULL,
  `TipoRetencion` enum('IVA','ISLR') NOT NULL,
  `NumeroComprobante` varchar(50) default NULL,
  `MontoRetenidoUSD` decimal(18,4) NOT NULL,
  PRIMARY KEY  (`IdRetencion`),
  KEY `idx_ret_mov` (`IdMovimiento`),
  CONSTRAINT `fk_ret_mov` FOREIGN KEY (`IdMovimiento`) REFERENCES `cxc_movimientos` (`IdMov`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cxcmoves`
#

DROP TABLE IF EXISTS `cxcmoves`;

CREATE TABLE `cxcmoves` (
  `IdFactura` varchar(12) default NULL,
  `Doc_No` varchar(20) default NULL,
  `Operacion` varchar(7) default NULL,
  `Divisa` varchar(3) NOT NULL default 'USD',
  `IdCliente` varchar(15) default NULL,
  `Fecha` date default NULL,
  `Vencimiento` date default NULL,
  `Descripcion` varchar(50) default NULL,
  `Prioridad` int(11) default NULL,
  `Debe` double(15,3) default NULL,
  `Haber` double(15,3) default NULL,
  `Cancelada` tinyint(1) default NULL,
  KEY `idx_cxcmoves_factura` (`IdFactura`),
  KEY `idx_cxcmoves_cliente` (`IdCliente`),
  KEY `idx_cxcmoves_fecha` (`Fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `cxpmoves`
#

DROP TABLE IF EXISTS `cxpmoves`;

CREATE TABLE `cxpmoves` (
  `IdFactura` varchar(12) default NULL,
  `Doc_No` varchar(20) default NULL,
  `Operacion` varchar(7) default NULL,
  `IdProveedor` varchar(8) default NULL,
  `Fecha` date default NULL,
  `Vencimiento` date default NULL,
  `Descripcion` varchar(50) default NULL,
  `Prioridad` int(11) default NULL,
  `Debe` double(15,3) default NULL,
  `Haber` double(15,3) default NULL,
  `Cancelada` tinyint(1) default NULL,
  KEY `idx_cxpmoves_factura` (`IdFactura`),
  KEY `idx_cxpmoves_proveedor` (`IdProveedor`),
  KEY `idx_cxpmoves_fecha` (`Fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `depositos`
#

DROP TABLE IF EXISTS `depositos`;

CREATE TABLE `depositos` (
  `IdDeposito` varchar(10) NOT NULL,
  `Descripcion` varchar(50) default NULL,
  `Responsable` varchar(50) default NULL,
  PRIMARY KEY  (`IdDeposito`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `detcompuestos`
#

DROP TABLE IF EXISTS `detcompuestos`;

CREATE TABLE `detcompuestos` (
  `IdProdCompuesto` varchar(25) NOT NULL,
  `IdProducto` varchar(25) NOT NULL,
  `Unidad` char(3) default NULL,
  `Cantidad` double default NULL,
  `Costo` double default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `divisas`
#

DROP TABLE IF EXISTS `divisas`;

CREATE TABLE `divisas` (
  `IdDivisa` varchar(2) NOT NULL,
  `Descripcion` varchar(50) default NULL,
  `Singular` varchar(50) default NULL,
  `Plural` varchar(50) default NULL,
  `Simbolo` varchar(5) default NULL,
  `Mnemonico` varchar(15) default NULL,
  `Cambio` double default '1',
  `Operacion` char(1) default '*',
  `Orden` int(11) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `empresas`
#

DROP TABLE IF EXISTS `empresas`;

CREATE TABLE `empresas` (
  `IdEmpresa` varchar(2) default NULL,
  `Nombre` varchar(50) default NULL,
  `Rif` varchar(20) default NULL,
  `Nit` varchar(20) default NULL,
  `Direccion` varchar(250) default NULL,
  `Telefono` varchar(20) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `existencias`
#

DROP TABLE IF EXISTS `existencias`;

CREATE TABLE `existencias` (
  `IdDeposito` varchar(10) default '00',
  `IdProducto` varchar(25) default NULL,
  `Disponible` double default NULL,
  KEY `idx_existencias_producto` (`IdProducto`),
  KEY `idx_existencias_deposito` (`IdDeposito`),
  KEY `idx_existencias_producto_deposito` (`IdProducto`,`IdDeposito`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `fact_vendedor_comisiones`
#

DROP TABLE IF EXISTS `fact_vendedor_comisiones`;

CREATE TABLE `fact_vendedor_comisiones` (
  `id` int(11) NOT NULL auto_increment,
  `masterfactId` varchar(12) NOT NULL,
  `grupoId` varchar(10) NOT NULL,
  `comision` float NOT NULL,
  PRIMARY KEY  (`id`),
  KEY `masterfactId` (`masterfactId`),
  KEY `grupoId` (`grupoId`),
  CONSTRAINT `fact_vendedor_comisiones_ibfk_1` FOREIGN KEY (`masterfactId`) REFERENCES `masterfact` (`IdFactura`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fact_vendedor_comisiones_ibfk_2` FOREIGN KEY (`grupoId`) REFERENCES `grupos` (`IdGrupo`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `formaspago`
#

DROP TABLE IF EXISTS `formaspago`;

CREATE TABLE `formaspago` (
  `IdForma` varchar(10) default NULL,
  `Descripcion` varchar(50) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `grupos`
#

DROP TABLE IF EXISTS `grupos`;

CREATE TABLE `grupos` (
  `IdGrupo` varchar(10) NOT NULL,
  `Descripcion` varchar(50) default NULL,
  PRIMARY KEY  (`IdGrupo`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `grupos_clt`
#

DROP TABLE IF EXISTS `grupos_clt`;

CREATE TABLE `grupos_clt` (
  `IdGrupo` varchar(4) NOT NULL,
  `Descripcion` varchar(50) default NULL,
  PRIMARY KEY  (`IdGrupo`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `grupos_prov`
#

DROP TABLE IF EXISTS `grupos_prov`;

CREATE TABLE `grupos_prov` (
  `IdGrupo` varchar(4) NOT NULL,
  `Descripcion` varchar(50) default NULL,
  PRIMARY KEY  (`IdGrupo`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `grupos_vend`
#

DROP TABLE IF EXISTS `grupos_vend`;

CREATE TABLE `grupos_vend` (
  `IdGrupo` varchar(4) default NULL,
  `Descripcion` varchar(50) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `impuestos`
#

DROP TABLE IF EXISTS `impuestos`;

CREATE TABLE `impuestos` (
  `ID_IMP` varchar(1) default NULL,
  `DENOMINACION` varchar(50) default NULL,
  `MNEMONICO` varchar(15) default NULL,
  `TASA` double default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `inv_moves`
#

DROP TABLE IF EXISTS `inv_moves`;

CREATE TABLE `inv_moves` (
  `IdProducto` varchar(25) default NULL,
  `Fecha` date default NULL,
  `Tipo` char(2) default NULL COMMENT 'EN, SA, RE, AC',
  `No_Move` varchar(20) default NULL,
  `Unidad` varchar(3) default NULL,
  `Cantidad` double NOT NULL default '0',
  `Costo` double NOT NULL default '0',
  `Origen` char(3) default NULL,
  `IdDeposito` varchar(10) default '00',
  `Clave` varchar(20) default NULL,
  KEY `idx_invmoves_producto` (`IdProducto`),
  KEY `idx_invmoves_fecha` (`Fecha`),
  KEY `idx_invmoves_producto_fecha` (`IdProducto`,`Fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `inv_seriales`
#

DROP TABLE IF EXISTS `inv_seriales`;

CREATE TABLE `inv_seriales` (
  `IdProducto` varchar(25) default NULL,
  `Tipo` char(2) default NULL,
  `No_Move` varchar(20) default NULL,
  `Origen` char(3) default NULL,
  `Serial` varchar(25) default NULL,
  `Orden` int(10) default NULL,
  `IdDeposito` varchar(10) default '00',
  `Clave` varchar(20) default NULL,
  KEY `idx_inyseriales_producto` (`IdProducto`),
  KEY `idx_inyseriales_serial` (`Serial`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `log`
#

DROP TABLE IF EXISTS `log`;

CREATE TABLE `log` (
  `Id` int(11) NOT NULL auto_increment,
  `Detalle` varchar(250) default NULL,
  PRIMARY KEY  (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `lventas`
#

DROP TABLE IF EXISTS `lventas`;

CREATE TABLE `lventas` (
  `Fecha` date NOT NULL default '0000-00-00',
  `Rif` varchar(20) NOT NULL,
  `Nombre` varchar(60) NOT NULL,
  `NumCF` varchar(10) default NULL,
  `SerialIF` varchar(10) default NULL,
  `NumNC` varchar(10) default NULL,
  `NumFacAfec` varchar(10) default NULL,
  `TotalVentas` double NOT NULL default '0',
  `Exentas` double NOT NULL default '0',
  `Base` double NOT NULL default '0',
  `Impuesto` double NOT NULL default '0',
  `Contribuyente` tinyint(1) default NULL,
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `lventasnc`
#

DROP TABLE IF EXISTS `lventasnc`;

CREATE TABLE `lventasnc` (
  `Fecha` date NOT NULL default '0000-00-00',
  `IdFactura` varchar(12) NOT NULL default '',
  `NumCF` varchar(10) default NULL,
  `SerialIF` varchar(10) default NULL,
  `NumNC` varchar(10) default NULL,
  `Rif` varchar(12) NOT NULL default '',
  `Nombre` varchar(50) NOT NULL default '',
  `Exentas` double NOT NULL default '0',
  `Base` double NOT NULL default '0',
  `Impuesto` double NOT NULL default '0',
  `Total` double NOT NULL default '0',
  `Contribuyente` tinyint(1) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterauto`
#

DROP TABLE IF EXISTS `masterauto`;

CREATE TABLE `masterauto` (
  `IdAuto` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `Comentario` varchar(250) NOT NULL,
  `Anulada` tinyint(1) NOT NULL,
  `IdDeposito` varchar(10) default '00',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdAuto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `mastercomp`
#

DROP TABLE IF EXISTS `mastercomp`;

CREATE TABLE `mastercomp` (
  `IdFactura` varchar(12) NOT NULL default '',
  `Documento` varchar(20) default NULL,
  `Fecha` date NOT NULL default '0000-00-00',
  `IdProveedor` varchar(10) NOT NULL,
  `Nombre` varchar(50) NOT NULL default '',
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Anulada` tinyint(1) NOT NULL default '0',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdFactura`),
  KEY `idx_mastercomp_proveedor` (`IdProveedor`),
  KEY `idx_mastercomp_fecha` (`Fecha`),
  KEY `idx_mastercomp_fecha_cierre` (`Fecha`,`Cierre`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterfact`
#

DROP TABLE IF EXISTS `masterfact`;

CREATE TABLE `masterfact` (
  `IdFactura` varchar(12) NOT NULL default '',
  `NumCaja` varchar(2) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdCliente` varchar(15) NOT NULL default '',
  `Nombre` varchar(60) NOT NULL,
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL,
  `Anulada` tinyint(1) NOT NULL,
  `Precio` char(1) default NULL,
  `MontoTicket` double NOT NULL default '0',
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(15) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `MontoTransf` double NOT NULL default '0',
  `NoTransf` varchar(15) NOT NULL default '',
  `BcoTransf` varchar(5) NOT NULL default '',
  `MontoTarj` double NOT NULL default '0',
  `NoTarj` varchar(15) NOT NULL default '',
  `BcoTarj` varchar(15) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `NoImpresa` tinyint(1) default NULL,
  `NumCF` varchar(10) default NULL,
  `SerialIF` varchar(10) default NULL,
  `NumZ` varchar(10) default NULL,
  `Fuente` char(3) default 'FAC',
  `IdVend` varchar(8) default NULL,
  `IdDeposito` varchar(10) default '00',
  `IdDivisa` varchar(3) NOT NULL default '01',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  `TasaDeCambio` double(15,3) default '1.000',
  PRIMARY KEY  (`IdFactura`),
  KEY `idx_masterfact_fecha` (`Fecha`),
  KEY `idx_masterfact_cliente` (`IdCliente`),
  KEY `idx_masterfact_cierre` (`Cierre`),
  KEY `idx_masterfact_fecha_cierre` (`Fecha`,`Cierre`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterfactcp`
#

DROP TABLE IF EXISTS `masterfactcp`;

CREATE TABLE `masterfactcp` (
  `IdFactura` varchar(12) NOT NULL default '',
  `NumCaja` varchar(2) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdCliente` varchar(15) NOT NULL default '',
  `Nombre` varchar(60) NOT NULL default '',
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL,
  `Anulada` tinyint(1) NOT NULL,
  `Precio` char(1) default NULL,
  `MontoTicket` double NOT NULL default '0',
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(15) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `MontoTransf` double NOT NULL default '0',
  `NoTransf` varchar(15) NOT NULL default '',
  `BcoTransf` varchar(5) NOT NULL default '',
  `MontoTarj` double NOT NULL default '0',
  `NoTarj` varchar(15) NOT NULL default '',
  `BcoTarj` varchar(15) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `NoImpresa` tinyint(1) default NULL,
  `NumCF` varchar(10) default NULL,
  `SerialIF` varchar(10) default NULL,
  `NumZ` varchar(10) default NULL,
  `Fuente` char(3) default 'FAC',
  `IdVend` varchar(8) default NULL,
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdFactura`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `mastergastos`
#

DROP TABLE IF EXISTS `mastergastos`;

CREATE TABLE `mastergastos` (
  `IdGasto` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  `Anulada` tinyint(1) default '0',
  PRIMARY KEY  (`IdGasto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `mastermanu`
#

DROP TABLE IF EXISTS `mastermanu`;

CREATE TABLE `mastermanu` (
  `IdManufac` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `Comentario` varchar(250) NOT NULL,
  `Anulada` tinyint(1) NOT NULL,
  `IdDeposito` varchar(10) default '00',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdManufac`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masternccomp`
#

DROP TABLE IF EXISTS `masternccomp`;

CREATE TABLE `masternccomp` (
  `IdNC` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdFactura` varchar(12) NOT NULL default '',
  `Documento` varchar(20) default NULL,
  `IdProveedor` varchar(10) NOT NULL default '',
  `FechaF` date default NULL,
  `Nombre` varchar(60) NOT NULL default '',
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) default NULL,
  `Anulada` tinyint(1) NOT NULL,
  `Precio` char(1) default NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `NoImpresa` tinyint(1) default NULL,
  `NumNC` varchar(10) default NULL,
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdNC`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterncfact`
#

DROP TABLE IF EXISTS `masterncfact`;

CREATE TABLE `masterncfact` (
  `IdNC` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdFactura` varchar(12) NOT NULL default '',
  `IdCliente` varchar(15) NOT NULL default '',
  `FechaF` date default NULL,
  `Hora` time default NULL,
  `Nombre` varchar(60) NOT NULL default '',
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) default NULL,
  `Anulada` tinyint(1) NOT NULL,
  `Precio` char(1) default NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `NoImpresa` tinyint(1) default NULL,
  `NumNC` varchar(10) default NULL,
  `NumCF` varchar(10) default NULL,
  `SerialIF` varchar(10) default NULL,
  `NumZ` varchar(10) default NULL,
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdNC`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masternoe`
#

DROP TABLE IF EXISTS `masternoe`;

CREATE TABLE `masternoe` (
  `IdNoe` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdCliente` varchar(15) NOT NULL default '',
  `Nombre` varchar(60) NOT NULL,
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL,
  `Anulada` tinyint(1) NOT NULL,
  `Precio` char(1) default NULL,
  `MontoTicket` double NOT NULL default '0',
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(15) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `MontoTransf` double NOT NULL default '0',
  `NoTransf` varchar(15) NOT NULL default '',
  `BcoTransf` varchar(5) NOT NULL default '',
  `MontoTarj` double NOT NULL default '0',
  `NoTarj` varchar(15) NOT NULL default '',
  `BcoTarj` varchar(15) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `NoImpresa` tinyint(1) default NULL,
  `NumCF` varchar(10) default NULL,
  `SerialIF` varchar(10) default NULL,
  `NumZ` varchar(10) default NULL,
  `Fuente` char(3) default 'FAC',
  `IdVend` varchar(8) default NULL,
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdNoe`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masternor`
#

DROP TABLE IF EXISTS `masternor`;

CREATE TABLE `masternor` (
  `IdNor` varchar(12) NOT NULL default '',
  `Documento` varchar(20) default NULL,
  `Fecha` date NOT NULL default '0000-00-00',
  `IdProveedor` varchar(10) NOT NULL,
  `Nombre` varchar(50) NOT NULL default '',
  `Rif` varchar(20) NOT NULL,
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Anulada` tinyint(1) NOT NULL default '0',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdNor`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterorden`
#

DROP TABLE IF EXISTS `masterorden`;

CREATE TABLE `masterorden` (
  `IdOrden` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdCliente` varchar(15) NOT NULL default '',
  `Nombre` varchar(60) NOT NULL default '',
  `Rif` varchar(12) NOT NULL default '',
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL,
  `Procesado` tinyint(1) NOT NULL,
  `Precio` char(1) default NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `Anulada` tinyint(1) default NULL,
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdOrden`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterpedido`
#

DROP TABLE IF EXISTS `masterpedido`;

CREATE TABLE `masterpedido` (
  `IdPedido` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdCliente` varchar(15) NOT NULL,
  `Nombre` varchar(60) NOT NULL,
  `Rif` varchar(12) NOT NULL,
  `Nit` varchar(12) NOT NULL default ' ',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) NOT NULL default 'Contado',
  `Procesado` tinyint(1) NOT NULL default '0',
  `Precio` char(1) default NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default ' ',
  `IdBanco` varchar(5) NOT NULL default ' ',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `Anulada` tinyint(1) default NULL,
  `IdDeposito` varchar(10) default '00',
  `IdVend` varchar(8) default NULL,
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdPedido`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterpre`
#

DROP TABLE IF EXISTS `masterpre`;

CREATE TABLE `masterpre` (
  `IdPre` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdCliente` varchar(15) NOT NULL default '',
  `Nombre` varchar(60) NOT NULL default '',
  `Rif` varchar(12) NOT NULL default '',
  `Nit` varchar(12) NOT NULL default '',
  `Direccion` varchar(250) NOT NULL,
  `Telfs` varchar(50) default NULL,
  `Contribuyente` tinyint(1) default NULL,
  `Condicion` varchar(15) default NULL,
  `Anulada` tinyint(1) default NULL,
  `Procesado` tinyint(1) NOT NULL default '0',
  `Precio` char(1) default NULL,
  `MontoEfectivo` double NOT NULL default '0',
  `MontoCheque` double NOT NULL default '0',
  `NoCheque` varchar(12) NOT NULL default '',
  `IdBanco` varchar(5) NOT NULL default '',
  `DiasVencimiento` int(11) NOT NULL default '0',
  `Vencimiento` date NOT NULL default '0000-00-00',
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdPre`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `masterret`
#

DROP TABLE IF EXISTS `masterret`;

CREATE TABLE `masterret` (
  `IdRetiro` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `Comentario` varchar(250) NOT NULL,
  `Anulada` tinyint(1) NOT NULL,
  `IdDeposito` varchar(10) default '00',
  `Tasa_Venta` double NOT NULL default '0',
  `Moneda` varchar(3) NOT NULL default 'BsS',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(20) NOT NULL default '',
  PRIMARY KEY  (`IdRetiro`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `mastertras`
#

DROP TABLE IF EXISTS `mastertras`;

CREATE TABLE `mastertras` (
  `IdTraslado` varchar(20) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `IdDepOrigen` varchar(10) default NULL,
  `DesDepOrigen` varchar(50) default NULL,
  `RespDepOrigen` varchar(100) default NULL,
  `IdDepDestino` varchar(10) default NULL,
  `DesDepDestino` varchar(50) default NULL,
  `RespDepDestino` varchar(100) default NULL,
  `Anulada` tinyint(1) default '-1',
  `Cierre` tinyint(1) default '-1',
  `Clave` varchar(15) NOT NULL default '',
  `Usuario` varchar(15) NOT NULL default '',
  PRIMARY KEY  (`IdTraslado`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `mediosdepago`
#

DROP TABLE IF EXISTS `mediosdepago`;

CREATE TABLE `mediosdepago` (
  `IdMedio` varchar(2) NOT NULL,
  `Descripcion` varchar(25) default NULL COMMENT 'A: Aprobado, R: Reporbado, D: Denegado',
  `Abreviatura` varchar(10) default NULL,
  `Bancos` tinyint(1) default '0',
  `Detalles` tinyint(1) default '0',
  `IdImpFiscal` varchar(2) default '01',
  `Orden` int(11) default NULL,
  PRIMARY KEY  (`IdMedio`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `pagos`
#

DROP TABLE IF EXISTS `pagos`;

CREATE TABLE `pagos` (
  `IdDocumento` varchar(12) NOT NULL default '',
  `Fuente` varchar(3) NOT NULL default '',
  `NumCaja` varchar(2) default NULL,
  `Fecha` date NOT NULL default '0000-00-00',
  `IdMedio` varchar(2) default NULL,
  `Monto` double(15,3) NOT NULL,
  `IdBanco` varchar(10) default NULL,
  `Nombre` varchar(50) default NULL,
  `Detalle` varchar(150) default NULL,
  `Clave` varchar(20) NOT NULL default '',
  KEY `idx_pagos_factura` (`IdDocumento`),
  KEY `idx_pagos_fecha` (`Fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `presentacion`
#

DROP TABLE IF EXISTS `presentacion`;

CREATE TABLE `presentacion` (
  `IdPres` char(3) default NULL,
  `Descripcion` varchar(50) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `productos`
#

DROP TABLE IF EXISTS `productos`;

CREATE TABLE `productos` (
  `IdProducto` varchar(25) NOT NULL,
  `Referencia` varchar(30) default NULL,
  `Descripcion` varchar(150) default NULL,
  `Presentacion` char(3) default NULL,
  `PrecioA` double default NULL,
  `PrecioB` double default NULL,
  `PrecioC` double default NULL,
  `PorcA` double default NULL,
  `PorcB` double default NULL,
  `PorcC` double default NULL,
  `Costo` double default NULL,
  `Valor_Indexado` tinyint(1) default NULL,
  `CostoUSD` double default NULL,
  `Minimo` double default NULL,
  `Maximo` double default NULL,
  `Grupo` varchar(10) default NULL,
  `Gravado` tinyint(1) default NULL,
  `Impuesto` char(2) default NULL,
  `Existencia` double default NULL,
  `Unidad` char(3) default NULL,
  `Peso` decimal(15,3) default '0.000',
  `Marca` varchar(50) default NULL,
  `Modelo` varchar(50) default NULL,
  `Tipo` char(1) default '0',
  `Proveedor` varchar(10) default NULL,
  `Inventario` tinyint(1) default NULL,
  `Seriales` tinyint(1) default NULL,
  `Detallable` tinyint(4) default '0',
  `MnjGarantia` tinyint(1) default NULL,
  `TiempoGarantia` double(15,3) default NULL,
  `LapsoGarantia` int(11) default NULL,
  PRIMARY KEY  (`IdProducto`),
  KEY `idx_productos_descripcion` (`Descripcion`),
  KEY `idx_productos_referencia` (`Referencia`),
  KEY `idx_productos_grupo` (`Grupo`),
  KEY `idx_productos_proveedor` (`Proveedor`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `proveedores`
#

DROP TABLE IF EXISTS `proveedores`;

CREATE TABLE `proveedores` (
  `IdProveedor` varchar(10) NOT NULL,
  `Empresa` varchar(50) default NULL,
  `Rif` varchar(20) default NULL,
  `Nit` varchar(20) default NULL,
  `Ci` varchar(20) default NULL,
  `Contacto` varchar(60) default NULL,
  `Direccion` varchar(250) default NULL,
  `Telfs` varchar(50) default NULL,
  `Observacion` varchar(250) default NULL,
  `Status` char(1) default NULL,
  `Contribuyente` tinyint(1) default '-1',
  `Grupo` varchar(4) default NULL,
  `Clave` varchar(50) default NULL,
  PRIMARY KEY  (`IdProveedor`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `relaciongastoscat`
#

DROP TABLE IF EXISTS `relaciongastoscat`;

CREATE TABLE `relaciongastoscat` (
  `IdCentro` varchar(15) NOT NULL default '',
  `Descripcion` varchar(150) NOT NULL,
  `GastoNeto` double NOT NULL default '0',
  `TasaGasto` double NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `relacionventascat`
#

DROP TABLE IF EXISTS `relacionventascat`;

CREATE TABLE `relacionventascat` (
  `IdGrupo` varchar(15) NOT NULL default '',
  `Descripcion` varchar(150) NOT NULL,
  `VentaNeta` double NOT NULL default '0',
  `CostoVenta` double NOT NULL default '0',
  `UtilNeta` double NOT NULL default '0',
  `TasaBenef` double NOT NULL default '0',
  `TasaVenta` double NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `rpt_vtas`
#

DROP TABLE IF EXISTS `rpt_vtas`;

CREATE TABLE `rpt_vtas` (
  `IdFactura` varchar(12) NOT NULL default '',
  `Fecha` date NOT NULL default '0000-00-00',
  `Nombre` varchar(50) NOT NULL default '',
  `Monto` double NOT NULL default '0',
  `Observacion` varchar(12) NOT NULL default '',
  PRIMARY KEY  (`IdFactura`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `rpt_vtas_d`
#

DROP TABLE IF EXISTS `rpt_vtas_d`;

CREATE TABLE `rpt_vtas_d` (
  `IdFactura` varchar(12) NOT NULL default '',
  `Cat0` double NOT NULL default '0',
  `Cat1` double NOT NULL default '0',
  `Cat2` double NOT NULL default '0',
  `Cat3` double NOT NULL default '0',
  `T` double NOT NULL default '0',
  PRIMARY KEY  (`IdFactura`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `rptcapital`
#

DROP TABLE IF EXISTS `rptcapital`;

CREATE TABLE `rptcapital` (
  `IdProducto` varchar(25) default NULL,
  `Existencia` double default NULL,
  `Descripcion` varchar(150) default NULL,
  `Fecha` date default NULL,
  `Minimo` double default NULL,
  `Promedio` double default NULL,
  `Maximo` double default NULL,
  `Unidad` char(3) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `rutas`
#

DROP TABLE IF EXISTS `rutas`;

CREATE TABLE `rutas` (
  `Id_Ruta` char(3) NOT NULL,
  `Nombre` char(50) default NULL,
  PRIMARY KEY  (`Id_Ruta`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `seriales_dsp`
#

DROP TABLE IF EXISTS `seriales_dsp`;

CREATE TABLE `seriales_dsp` (
  `IdProducto` varchar(25) default NULL,
  `IdDeposito` varchar(10) default '00',
  `No_Move` varchar(20) default NULL,
  `Origen` char(3) default NULL,
  `Serial` varchar(30) default NULL,
  `Reservado` tinyint(1) default NULL,
  `Orden` int(10) default NULL,
  `Clave` varchar(20) NOT NULL default ' '
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `seriales_tmp`
#

DROP TABLE IF EXISTS `seriales_tmp`;

CREATE TABLE `seriales_tmp` (
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(150) default NULL,
  `Serial` varchar(30) default NULL,
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `seriales_tmp_f`
#

DROP TABLE IF EXISTS `seriales_tmp_f`;

CREATE TABLE `seriales_tmp_f` (
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(150) default NULL,
  `Serial` varchar(30) default NULL,
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `servicios`
#

DROP TABLE IF EXISTS `servicios`;

CREATE TABLE `servicios` (
  `ID_SERV` varchar(15) default NULL,
  `DESCRIPCION` varchar(100) default NULL,
  `UNIDAD` varchar(5) default NULL,
  `MONTO1` double(15,5) default NULL,
  `MONTO2` double(15,5) default NULL,
  `MONTO3` double(15,3) default NULL,
  `TIPO` varchar(1) default NULL,
  `GRAVADO` tinyint(1) NOT NULL,
  `ID_IMP` varchar(10) default NULL,
  `CLASIF_CONTAB` int(11) default NULL,
  `IDGRUPO` varchar(10) default NULL,
  KEY `ID_HAB` (`ID_SERV`),
  KEY `ID_IMP` (`ID_IMP`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slaveauto`
#

DROP TABLE IF EXISTS `slaveauto`;

CREATE TABLE `slaveauto` (
  `IdAuto` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slaveautoser`
#

DROP TABLE IF EXISTS `slaveautoser`;

CREATE TABLE `slaveautoser` (
  `IdAuto` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'INV',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavecomp`
#

DROP TABLE IF EXISTS `slavecomp`;

CREATE TABLE `slavecomp` (
  `IdFactura` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Tipo` char(10) NOT NULL default 'CLASICO',
  `Orden` int(11) NOT NULL default '0',
  `Inventario` tinyint(1) default '-1',
  `Seriales` tinyint(1) default '0',
  KEY `idx_slavecomp_factura` (`IdFactura`),
  KEY `idx_slavecomp_producto` (`IdProducto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavecompser`
#

DROP TABLE IF EXISTS `slavecompser`;

CREATE TABLE `slavecompser` (
  `IdFactura` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Orden` int(10) default NULL,
  KEY `idx_slavecompser_factura` (`IdFactura`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavefact`
#

DROP TABLE IF EXISTS `slavefact`;

CREATE TABLE `slavefact` (
  `IdFactura` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `NumCaja` varchar(2) NOT NULL default '',
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double NOT NULL default '0',
  `CostoUSD` double NOT NULL default '0',
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) NOT NULL default '0',
  KEY `idx_slavefact_factura` (`IdFactura`),
  KEY `idx_slavefact_producto` (`IdProducto`),
  KEY `idx_slavefact_factura_producto` (`IdFactura`,`IdProducto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavefactcp`
#

DROP TABLE IF EXISTS `slavefactcp`;

CREATE TABLE `slavefactcp` (
  `IdFactura` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `NumCaja` varchar(2) NOT NULL default '',
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavefactcpser`
#

DROP TABLE IF EXISTS `slavefactcpser`;

CREATE TABLE `slavefactcpser` (
  `IdFactura` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `NumCaja` varchar(2) NOT NULL default '',
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavefactser`
#

DROP TABLE IF EXISTS `slavefactser`;

CREATE TABLE `slavefactser` (
  `IdFactura` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `NumCaja` varchar(2) NOT NULL default '',
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) default NULL,
  KEY `idx_slavefactser_factura` (`IdFactura`),
  KEY `idx_slavefactser_producto` (`IdProducto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavegastos`
#

DROP TABLE IF EXISTS `slavegastos`;

CREATE TABLE `slavegastos` (
  `IdGasto` varchar(12) NOT NULL default '',
  `IdConcepto` varchar(10) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Unidad` char(3) default NULL,
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavemanu`
#

DROP TABLE IF EXISTS `slavemanu`;

CREATE TABLE `slavemanu` (
  `IdManufac` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Tipo` char(1) default NULL,
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavemanuser`
#

DROP TABLE IF EXISTS `slavemanuser`;

CREATE TABLE `slavemanuser` (
  `IdManufac` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'INV',
  `Tipo` char(1) default NULL,
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavenccomp`
#

DROP TABLE IF EXISTS `slavenccomp`;

CREATE TABLE `slavenccomp` (
  `IdNC` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double default '0',
  `CostoUSD` double NOT NULL default '0',
  `Orden` int(11) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavenccompser`
#

DROP TABLE IF EXISTS `slavenccompser`;

CREATE TABLE `slavenccompser` (
  `IdNC` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavencfact`
#

DROP TABLE IF EXISTS `slavencfact`;

CREATE TABLE `slavencfact` (
  `IdNC` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double default '0',
  `CostoUSD` double NOT NULL default '0',
  `Orden` int(11) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavencfactcpser`
#

DROP TABLE IF EXISTS `slavencfactcpser`;

CREATE TABLE `slavencfactcpser` (
  `IdNC` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavencfactser`
#

DROP TABLE IF EXISTS `slavencfactser`;

CREATE TABLE `slavencfactser` (
  `IdNC` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavenoe`
#

DROP TABLE IF EXISTS `slavenoe`;

CREATE TABLE `slavenoe` (
  `IdNoe` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Fuente` char(3) default 'NOE',
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavenoeser`
#

DROP TABLE IF EXISTS `slavenoeser`;

CREATE TABLE `slavenoeser` (
  `IdNoe` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'NOE',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavenor`
#

DROP TABLE IF EXISTS `slavenor`;

CREATE TABLE `slavenor` (
  `IdNor` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Tipo` char(10) NOT NULL default 'CLASICO',
  `Orden` int(11) NOT NULL default '0',
  `Inventario` tinyint(1) default '-1',
  `Seriales` tinyint(1) default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavenorser`
#

DROP TABLE IF EXISTS `slavenorser`;

CREATE TABLE `slavenorser` (
  `IdNor` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slaveorden`
#

DROP TABLE IF EXISTS `slaveorden`;

CREATE TABLE `slaveorden` (
  `IdOrden` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Orden` int(11) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavepedido`
#

DROP TABLE IF EXISTS `slavepedido`;

CREATE TABLE `slavepedido` (
  `IdPedido` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Orden` int(11) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavepre`
#

DROP TABLE IF EXISTS `slavepre`;

CREATE TABLE `slavepre` (
  `IdPre` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Orden` int(11) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slaveret`
#

DROP TABLE IF EXISTS `slaveret`;

CREATE TABLE `slaveret` (
  `IdRetiro` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slaveretser`
#

DROP TABLE IF EXISTS `slaveretser`;

CREATE TABLE `slaveretser` (
  `IdRetiro` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'INV',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavetras`
#

DROP TABLE IF EXISTS `slavetras`;

CREATE TABLE `slavetras` (
  `IdTraslado` varchar(12) NOT NULL default '',
  `IdProducto` varchar(25) NOT NULL,
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL default '0',
  `PrecioBs` double NOT NULL default '0',
  `PrecioUSD` double NOT NULL default '0',
  `Unidad` char(3) default NULL,
  `Gravado` tinyint(1) NOT NULL,
  `Id_Imp` varchar(20) default NULL,
  `Tasa` double NOT NULL default '0',
  `MontoImp` double(15,3) NOT NULL,
  `Dcto` double NOT NULL default '0',
  `Cantidad` double NOT NULL default '0',
  `Costo` double(15,3) default NULL,
  `CostoUSD` double NOT NULL default '0',
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) NOT NULL default '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `slavetrasser`
#

DROP TABLE IF EXISTS `slavetrasser`;

CREATE TABLE `slavetrasser` (
  `IdTraslado` varchar(12) default NULL,
  `IdProducto` varchar(25) default NULL,
  `Descripcion` varchar(75) default NULL,
  `Serial` varchar(30) default NULL,
  `Fuente` char(3) default 'FAC',
  `Orden` int(10) default NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `tabla_imagenes`
#

DROP TABLE IF EXISTS `tabla_imagenes`;

CREATE TABLE `tabla_imagenes` (
  `IdProducto` varchar(25) NOT NULL,
  `NomArchivo` varchar(20) NOT NULL,
  PRIMARY KEY  (`IdProducto`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `vendedor_comisiones`
#

DROP TABLE IF EXISTS `vendedor_comisiones`;

CREATE TABLE `vendedor_comisiones` (
  `id` int(11) NOT NULL auto_increment,
  `vendedorId` varchar(8) NOT NULL,
  `grupoId` varchar(10) NOT NULL,
  `comision` float NOT NULL,
  PRIMARY KEY  (`id`),
  KEY `vendedorId` (`vendedorId`),
  KEY `grupoId` (`grupoId`),
  CONSTRAINT `vendedor_comisiones_ibfk_1` FOREIGN KEY (`vendedorId`) REFERENCES `vendedores` (`IdVend`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `vendedor_comisiones_ibfk_2` FOREIGN KEY (`grupoId`) REFERENCES `grupos` (`IdGrupo`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Estructura de la tabla `vendedores`
#

DROP TABLE IF EXISTS `vendedores`;

CREATE TABLE `vendedores` (
  `IdVend` varchar(8) NOT NULL,
  `Empresa` varchar(50) default NULL,
  `Rif` varchar(20) default NULL,
  `Ci` varchar(20) default NULL,
  `Contacto` varchar(60) default NULL,
  `Direccion` varchar(250) default NULL,
  `Telfs` varchar(50) default NULL,
  `Email` varchar(50) default NULL,
  `Observacion` varchar(250) default NULL,
  `Status` char(1) default NULL,
  `Grupo` varchar(4) default NULL,
  `Clave` varchar(50) default NULL,
  PRIMARY KEY  (`IdVend`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

#
# Fin de la estructura de la base de datos `bdsolser_md_nieto`
#

INSERT INTO `control` (`Clave`, `Nombre`, `Usuario`, `Nivel`, `Fecha`, `Directiva`) VALUES ('123','Usuario','Solser','0','2008-05-31','1');
COMMIT;

INSERT INTO `empresas` (`IdEmpresa`, `Nombre`, `Rif`, `Nit`, `Direccion`, `Telefono`) VALUES  ('00','Empresa C.A.','J-00000000-5','','RIF','');
COMMIT;

INSERT INTO `impuestos` (`ID_IMP`, `DENOMINACION`, `MNEMONICO`, `TASA`) VALUES ('0','TASA GENERAL','I.V.A.',12), ('1','TASA REDUCIDA','I.V.A',8), ('2','TASA AMPLIADA','I.V.A.',22);
COMMIT;

