import { render, screen } from "@testing-library/react";
import KpiCard from "./KpiCard";

describe("KpiCard", () => {
  it("muestra el label y valor formateado", () => {
    render(<KpiCard label="Venta Bruta" value="$12,450,000" />);
    expect(screen.getByText("Venta Bruta")).toBeInTheDocument();
    expect(screen.getByText("$12,450,000")).toBeInTheDocument();
  });

  it("muestra ▲ verde cuando comparison es positivo", () => {
    render(<KpiCard label="Venta Bruta" value="$100" comparison={{ current: 100, previous: 80 }} />);
    const indicator = screen.getByText(/▲/);
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("text-success");
  });

  it("muestra ▼ rojo cuando comparison es negativo", () => {
    render(<KpiCard label="Venta Bruta" value="$80" comparison={{ current: 80, previous: 100 }} />);
    const indicator = screen.getByText(/▼/);
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass("text-danger");
  });

  it("no muestra indicador si comparison es undefined", () => {
    render(<KpiCard label="Margen %" value="32.5%" />);
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument();
  });

  it("no muestra indicador si previous es 0", () => {
    render(<KpiCard label="Venta Bruta" value="$100" comparison={{ current: 100, previous: 0 }} />);
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument();
  });

  it("muestra spinner cuando loading es true", () => {
    render(<KpiCard label="Venta Bruta" value="$100" loading={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
